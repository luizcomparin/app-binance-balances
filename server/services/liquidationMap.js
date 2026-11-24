// Mapa de liquidação ESTIMADO (rota /liquidation-map/:asset), a partir de dados públicos dos futuros.
//
// Ninguém publica onde está cada posição alavancada; o modelo (mesma ideia dos "liquidation heatmaps")
// deduz isso hora a hora nos últimos 30 dias:
//   1. Open interest subiu na hora → posições novas abertas perto do preço médio daquela hora.
//      Cada contrato novo tem um comprado (long) e um vendido (short).
//   2. Quem está mais exposto: mistura da razão long/short das contas, da posição dos top traders
//      e do volume agressor de compra daquela hora.
//   3. Alavancagens típicas (5x a 100x) → preço de liquidação de cada fatia:
//        long:  P × (1 − 1/alav + margem de manutenção)   short: P × (1 + 1/alav − margem)
//   4. Open interest caiu → posições fechadas: reduz todas proporcionalmente.
//   5. O preço passou pelo nível (máxima/mínima da hora) → aquelas posições foram liquidadas: some.
// O que sobra são as regiões onde ainda haveria liquidações em cascata. É estimativa, não dado real.
//
// Com a chave da Coinalyze, as liquidações reais da Binance (por hora) ajustam o modelo: no passo 4 a parte
// da queda do OI que foi liquidação não conta, e os níveis de cada lado são calibrados pelo que de fato foi
// liquidado (services/liquidationModel.js). A divisão por alavancagem (5x a 100x) também é ajustada
// pelas liquidações reais, quando isso melhora o acerto num trecho que ficou fora do ajuste.
import { cached } from "../lib/cache.js";
import { fapiGet, futuresDataSeries, getPerpetualFor } from "../binance/futures.js";
import { getCoinalyzeKey } from "../config.js";
import { buildLiquidations } from "./liquidations.js";
import { BUCKET_PCT, LEVERAGE_TIERS, MAINTENANCE_MARGIN, runLiquidationModel } from "./liquidationModel.js";

const HOURS = 30 * 24; // a Binance só guarda 30 dias de open interest/long-short
const CACHE_MS = 5 * 60 * 1000;
const CALIBRATION_EXCHANGE = "Binance"; // o open interest do modelo é só da Binance

// Série /futures/data/* das últimas HOURS horas
const hourlySeries = (path, symbol) => futuresDataSeries(path, symbol, "1h", HOURS);

export function buildLiquidationMap(asset) {
	// com e sem chave da Coinalyze o resultado muda (calibração): cache separado
	const mode = getCoinalyzeKey() ? "real" : "est";
	return cached(`liqmap:${asset}:${mode}`, CACHE_MS, () => computeLiquidationMap(asset));
}

// Liquidações reais por hora da Binance ({ rows: [{ t, long, short }] }) ou { reason } quando não há.
// Usa a mesma resposta (e o mesmo cache) do painel de liquidações em vela de 1h.
async function realBinanceLiquidations(asset) {
	if (!getCoinalyzeKey()) return { reason: "no-key" };
	const data = await buildLiquidations(asset, "1h").catch((err) => ({ available: false, reason: "error", message: err.message }));
	if (!data.available) return { reason: data.reason, message: data.message };
	if (!data.exchanges.includes(CALIBRATION_EXCHANGE)) return { reason: "no-market" };
	return {
		rows: data.rows
			.filter((r) => r.by?.[CALIBRATION_EXCHANGE])
			.map((r) => ({ t: r.t, long: r.by[CALIBRATION_EXCHANGE].long, short: r.by[CALIBRATION_EXCHANGE].short })),
	};
}

async function computeLiquidationMap(asset) {
	const contract = await getPerpetualFor(asset);
	if (!contract) return { asset, available: false, reason: "no-perpetual" };
	const { symbol, multiplier } = contract;

	const [klines, oi, globalLS, topLS, real] = await Promise.all([
		fapiGet(`/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=${HOURS + 1}`),
		hourlySeries("/futures/data/openInterestHist", symbol),
		hourlySeries("/futures/data/globalLongShortAccountRatio", symbol),
		hourlySeries("/futures/data/topLongShortPositionRatio", symbol),
		realBinanceLiquidations(asset),
	]);
	if (oi.length < 2 || !klines.length) return { asset, symbol, available: false, reason: "no-data" };

	const candles = klines.map((k) => ({
		time: k[0],
		high: Number(k[2]),
		low: Number(k[3]),
		close: Number(k[4]),
		typical: (Number(k[2]) + Number(k[3]) + Number(k[4])) / 3,
		takerBuyShare: Number(k[5]) ? Number(k[9]) / Number(k[5]) : 0.5,
	}));
	const model = runLiquidationModel({ candles, oi, globalLS, topLS, real: real.rows || null });
	const calibration = real.rows
		? { ...model.calibration, exchange: CALIBRATION_EXCHANGE }
		: { available: false, reason: real.reason, message: real.message };

	const spot = (p) => p / multiplier; // preço do contrato → preço da moeda
	return {
		asset,
		symbol,
		multiplier,
		available: true,
		price: spot(model.price),
		bucket: spot(model.bucket),
		from: oi[0].timestamp,
		hours: oi.length,
		ratios: model.ratios,
		levels: model.levels.map((l) => ({ ...l, price: spot(l.price) })),
		segments: model.segments.map((s) => ({ ...s, p: spot(s.p) })),
		calibration,
		// divisão por alavancagem usada (ajustada pelas liquidações reais ou a padrão) e o resultado do ajuste
		leverage: model.leverage,
		model: {
			leverageTiers: model.leverage.tiers,
			defaultLeverageTiers: LEVERAGE_TIERS,
			maintenanceMargin: MAINTENANCE_MARGIN,
			bucketPct: BUCKET_PCT,
		},
		generatedAt: Date.now(),
	};
}

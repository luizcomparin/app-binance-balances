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
import { cached } from "../lib/cache.js";
import { fapiGet, getPerpetualFor } from "../binance/futures.js";

const HOUR = 60 * 60 * 1000;
const HOURS = 30 * 24; // a Binance só guarda 30 dias de open interest/long-short
const PAGE = 500; // máximo por requisição nos endpoints /futures/data
const CACHE_MS = 5 * 60 * 1000;

// alavancagem → fatia das posições novas (suposição do modelo)
const LEVERAGE_TIERS = [
	{ leverage: 5, weight: 0.1 },
	{ leverage: 10, weight: 0.3 },
	{ leverage: 25, weight: 0.3 },
	{ leverage: 50, weight: 0.2 },
	{ leverage: 100, weight: 0.1 },
];
const MAINTENANCE_MARGIN = 0.005;
const BUCKET_PCT = 0.0025; // níveis agrupados em faixas de 0,25% do preço atual
// um trecho do mapa de calor é "quebrado" quando o valor do nível muda mais que isso
const SEGMENT_CHANGE = 0.25;
const MIN_SEGMENT_SHARE = 0.003; // trechos menores que 0,3% do maior não são enviados

// Série /futures/data/* das últimas HOURS horas (paginando para trás com endTime)
async function hourlySeries(path, symbol) {
	const out = [];
	let endTime = Date.now();
	while (out.length < HOURS) {
		const limit = Math.min(PAGE, HOURS - out.length);
		const page = await fapiGet(`${path}?symbol=${symbol}&period=1h&limit=${limit}&endTime=${endTime}`);
		if (!page.length) break;
		out.unshift(...page);
		if (page.length < limit) break;
		endTime = page[0].timestamp - 1;
	}
	// sem duplicados, em ordem de tempo
	const seen = new Set();
	return out.filter((r) => !seen.has(r.timestamp) && seen.add(r.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
}

// valor mais recente com timestamp <= t (séries vêm ordenadas)
function lookup(series, field) {
	let i = 0;
	return (t, fallback) => {
		while (i + 1 < series.length && series[i + 1].timestamp <= t) i++;
		const row = series[i];
		return row && row.timestamp <= t ? Number(row[field]) : fallback;
	};
}

export function buildLiquidationMap(asset) {
	return cached(`liqmap:${asset}`, CACHE_MS, () => computeLiquidationMap(asset));
}

async function computeLiquidationMap(asset) {
	const contract = await getPerpetualFor(asset);
	if (!contract) return { asset, available: false, reason: "no-perpetual" };
	const { symbol, multiplier } = contract;

	const [klines, oi, globalLS, topLS] = await Promise.all([
		fapiGet(`/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=${HOURS + 1}`),
		hourlySeries("/futures/data/openInterestHist", symbol),
		hourlySeries("/futures/data/globalLongShortAccountRatio", symbol),
		hourlySeries("/futures/data/topLongShortPositionRatio", symbol),
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
	const candleAt = new Map(candles.map((c) => [c.time, c]));
	const lastPrice = candles.at(-1).close;
	const bucket = lastPrice * BUCKET_PCT;
	const toBucket = (p) => Math.round(p / bucket) * bucket;

	const globalLong = lookup(globalLS, "longAccount");
	const topLong = lookup(topLS, "longAccount");

	// níveis ativos: "L|preço" / "S|preço" → { side, price, usd, seg: { from, usd } }
	const active = new Map();
	const segments = [];
	const closeSegment = (lvl, to) => {
		if (lvl.seg.usd > 0) segments.push({ p: lvl.price, s: lvl.side, f: lvl.seg.from, t: to, u: lvl.seg.usd });
	};
	const splitIfChanged = (lvl, now) => {
		if (Math.abs(lvl.usd - lvl.seg.usd) > lvl.seg.usd * SEGMENT_CHANGE) {
			closeSegment(lvl, now);
			lvl.seg = { from: now, usd: lvl.usd };
		}
	};

	for (let i = 1; i < oi.length; i++) {
		const from = oi[i - 1].timestamp;
		const candle = candleAt.get(from);
		if (!candle) continue;
		const now = candle.time;

		// 5. o preço desta hora passou pelos níveis → liquidados
		for (const [key, lvl] of active) {
			const hit = lvl.side === "L" ? candle.low <= lvl.price : candle.high >= lvl.price;
			if (!hit) continue;
			closeSegment(lvl, now);
			active.delete(key);
		}

		const qtyBefore = Number(oi[i - 1].sumOpenInterest);
		const qtyAfter = Number(oi[i].sumOpenInterest);
		if (!qtyBefore || !qtyAfter) continue;

		if (qtyAfter < qtyBefore) {
			// 4. posições fechadas: reduz todas na mesma proporção
			const f = qtyAfter / qtyBefore;
			for (const lvl of active.values()) {
				lvl.usd *= f;
				splitIfChanged(lvl, now + HOUR);
			}
			continue;
		}

		// 1-3. posições novas, divididas entre comprados e vendidos e por alavancagem
		const notional = (qtyAfter - qtyBefore) * candle.typical;
		const longShare =
			0.4 * globalLong(now, 0.5) + 0.3 * topLong(now, 0.5) + 0.3 * candle.takerBuyShare;
		for (const side of ["L", "S"]) {
			const sideUsd = notional * 2 * (side === "L" ? longShare : 1 - longShare);
			for (const { leverage, weight } of LEVERAGE_TIERS) {
				const move = 1 / leverage - MAINTENANCE_MARGIN;
				const price = toBucket(candle.typical * (side === "L" ? 1 - move : 1 + move));
				const key = `${side}|${price}`;
				let lvl = active.get(key);
				if (!lvl) {
					lvl = { side, price, usd: 0, seg: { from: now + HOUR, usd: 0 } };
					active.set(key, lvl);
				}
				lvl.usd += sideUsd * weight;
				if (!lvl.seg.usd) lvl.seg.usd = lvl.usd;
				else splitIfChanged(lvl, now + HOUR);
			}
		}
	}

	// níveis que continuam pendentes: trecho aberto até agora
	for (const lvl of active.values()) closeSegment(lvl, null);

	const maxU = Math.max(0, ...segments.map((s) => s.u));
	const spot = (p) => p / multiplier; // preço do contrato → preço da moeda
	const levels = new Map();
	for (const lvl of active.values()) {
		const row = levels.get(lvl.price) || { price: spot(lvl.price), long: 0, short: 0 };
		row[lvl.side === "L" ? "long" : "short"] += lvl.usd;
		levels.set(lvl.price, row);
	}

	return {
		asset,
		symbol,
		multiplier,
		available: true,
		price: spot(lastPrice),
		bucket: spot(bucket),
		from: oi[0].timestamp,
		hours: oi.length,
		ratios: {
			globalLongAccount: globalLong(Infinity, null),
			topLongPosition: topLong(Infinity, null),
		},
		levels: [...levels.values()]
			.map((l) => ({ price: l.price, long: Math.round(l.long), short: Math.round(l.short) }))
			.sort((a, b) => a.price - b.price),
		segments: segments
			.filter((s) => s.u >= maxU * MIN_SEGMENT_SHARE)
			.map((s) => ({ p: spot(s.p), s: s.s, f: s.f, t: s.t, u: Math.round(s.u) })),
		model: {
			leverageTiers: LEVERAGE_TIERS,
			maintenanceMargin: MAINTENANCE_MARGIN,
			bucketPct: BUCKET_PCT,
		},
		generatedAt: Date.now(),
	};
}

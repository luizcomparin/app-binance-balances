// Dados de futuros de uma moeda para os painéis abaixo do gráfico (rota /futures-data/:asset):
// open interest, razão long/short (contas e top traders) e taxa de funding do contrato perpétuo USDT.
import { cached } from "../lib/cache.js";
import { fapiGet, futuresDataSeries, getPerpetualFor } from "../binance/futures.js";

const CACHE_MS = 2 * 60 * 1000;
const DAYS = 30; // a Binance só guarda 30 dias de open interest/long-short
const PERIOD_MS = { "1h": 3600e3, "4h": 4 * 3600e3, "1d": 86400e3 };
export const FUTURES_PERIODS = new Set(Object.keys(PERIOD_MS));
const FUNDING_LIMIT = 1000; // ~333 dias com funding a cada 8h

export function buildFuturesData(asset, period) {
	return cached(`futures:${asset}:${period}`, CACHE_MS, () => computeFuturesData(asset, period));
}

async function computeFuturesData(asset, period) {
	const contract = await getPerpetualFor(asset);
	if (!contract) return { asset, available: false, reason: "no-perpetual" };
	const { symbol, multiplier } = contract;
	const count = Math.ceil((DAYS * 86400e3) / PERIOD_MS[period]);

	const [oi, globalLS, topLS, funding, premium] = await Promise.all([
		futuresDataSeries("/futures/data/openInterestHist", symbol, period, count),
		futuresDataSeries("/futures/data/globalLongShortAccountRatio", symbol, period, count),
		futuresDataSeries("/futures/data/topLongShortPositionRatio", symbol, period, count),
		fapiGet(`/fapi/v1/fundingRate?symbol=${symbol}&limit=${FUNDING_LIMIT}`),
		fapiGet(`/fapi/v1/premiumIndex?symbol=${symbol}`).catch(() => null),
	]);

	return {
		asset,
		symbol,
		multiplier,
		available: true,
		period,
		// open interest em USDT (valor dos contratos em aberto)
		oi: oi.map((r) => ({ t: r.timestamp, v: Number(r.sumOpenInterestValue) })),
		// fração de comprados (0–1)
		globalLS: globalLS.map((r) => ({ t: r.timestamp, l: Number(r.longAccount) })),
		topLS: topLS.map((r) => ({ t: r.timestamp, l: Number(r.longAccount) })),
		// taxa de cada cobrança (ex.: 0.0001 = 0,01%)
		funding: funding.map((r) => ({ t: r.fundingTime, r: Number(r.fundingRate) })),
		// taxa prevista para a próxima cobrança
		nextFunding: premium ? { r: Number(premium.lastFundingRate), t: premium.nextFundingTime } : null,
		generatedAt: Date.now(),
	};
}

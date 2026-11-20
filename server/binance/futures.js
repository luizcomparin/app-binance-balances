// Dados públicos dos futuros USDⓈ-M da Binance (fapi): sem chave, só leitura de mercado.
import fetch from "node-fetch";

const FAPI_URL = "https://fapi.binance.com";

export async function fapiGet(pathAndQuery) {
	const res = await fetch(`${FAPI_URL}${pathAndQuery}`);
	if (!res.ok) {
		const err = new Error(await res.text());
		err.status = res.status;
		throw err;
	}
	return res.json();
}

// Contratos perpétuos em USDT: baseAsset do contrato → { symbol, baseAsset }, com cache (exchangeInfo é pesado)
const INFO_TTL_MS = 6 * 60 * 60 * 1000;
let perpetuals = null;
let perpetualsAt = 0;

async function getPerpetuals() {
	if (perpetuals && Date.now() - perpetualsAt < INFO_TTL_MS) return perpetuals;
	const { symbols } = await fapiGet("/fapi/v1/exchangeInfo");
	const map = new Map();
	for (const s of symbols) {
		if (s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING") {
			map.set(s.baseAsset, s.symbol);
		}
	}
	perpetuals = map;
	perpetualsAt = Date.now();
	return map;
}

// Moedas de preço muito baixo são negociadas em lotes: 1000PEPE, 1000000MOG, 1MBABYDOGE...
const PREFIXES = [
	["", 1],
	["1000", 1000],
	["1000000", 1000000],
	["1M", 1000000],
];

/**
 * Contrato perpétuo USDT de uma moeda do spot: { symbol, multiplier } ou null se não existir.
 * multiplier: quantas moedas cada unidade do contrato representa (preço do contrato = preço spot × multiplier).
 */
export async function getPerpetualFor(asset) {
	const map = await getPerpetuals();
	for (const [prefix, multiplier] of PREFIXES) {
		const symbol = map.get(`${prefix}${asset}`);
		if (symbol) return { symbol, multiplier };
	}
	return null;
}

// ---- Séries /futures/data/* (open interest, long/short): no máximo 500 por requisição e só 30 dias ----
const DATA_PAGE = 500;

/**
 * Últimos `count` pontos de uma série /futures/data/* no período (5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d),
 * paginando para trás com endTime. Ordem de tempo, sem duplicados.
 */
export async function futuresDataSeries(path, symbol, period, count) {
	const out = [];
	let endTime = Date.now();
	while (out.length < count) {
		const limit = Math.min(DATA_PAGE, count - out.length);
		const page = await fapiGet(`${path}?symbol=${symbol}&period=${period}&limit=${limit}&endTime=${endTime}`);
		if (!page.length) break;
		out.unshift(...page);
		if (page.length < limit) break;
		endTime = page[0].timestamp - 1;
	}
	const seen = new Set();
	return out.filter((r) => !seen.has(r.timestamp) && seen.add(r.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
}

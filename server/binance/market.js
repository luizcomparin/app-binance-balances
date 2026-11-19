// Dados públicos de mercado: cotações, ticker 24h, pares (exchangeInfo) e conversão para USDT.
import { cached, SHORT_CACHE_MS } from "../lib/cache.js";
import { publicGet } from "./client.js";

// Busca TODAS as cotações
export async function getAllPrices() {
	return cached("prices", SHORT_CACHE_MS, fetchAllPrices);
}

async function fetchAllPrices() {
	const list = await publicGet("/api/v3/ticker/price");
	const priceMap = {};
	for (const item of list) {
		priceMap[item.symbol] = Number(item.price);
	}
	return priceMap;
}

// Cotações atuais + preço de 24h atrás (abertura da janela móvel de 24h)
export async function getTickers24h() {
	return cached("tickers24h", SHORT_CACHE_MS, fetchTickers24h);
}

async function fetchTickers24h() {
	const list = await publicGet("/api/v3/ticker/24hr?type=MINI");
	const prices = {};
	const openPrices = {};
	for (const t of list) {
		prices[t.symbol] = Number(t.lastPrice);
		openPrices[t.symbol] = Number(t.openPrice);
	}
	return { prices, openPrices };
}

// Moedas usadas como "ponte" quando não existe par direto com USDT
const BRIDGE_QUOTES = ["BTC", "ETH", "BNB", "FDUSD", "USDC"];

// Converte 1 unidade de `asset` para USDT usando o mapa de cotações.
// Ordem: par direto (XUSDT) → par invertido (USDTX, ex.: BRL) → via moeda ponte
// (X/BTC * BTC/USDT) → ativos do Simple Earn (LDBTC → BTC). Retorna null se não achar.
export function getPriceInUSDT(asset, prices) {
	if (asset === "USDT") return 1;

	if (prices[`${asset}USDT`]) return prices[`${asset}USDT`];
	if (prices[`USDT${asset}`]) return 1 / prices[`USDT${asset}`];

	for (const quote of BRIDGE_QUOTES) {
		const pairPrice = prices[`${asset}${quote}`];
		const quoteUSDT = prices[`${quote}USDT`];
		if (pairPrice && quoteUSDT) return pairPrice * quoteUSDT;
	}

	if (asset.startsWith("LD") && asset.length > 2) {
		return getPriceInUSDT(asset.slice(2), prices);
	}

	// stablecoin descontinuada, sem pares ativos
	if (asset === "BUSD") return 1;

	return null;
}

// Mapa symbol → { baseAsset, quoteAsset }, com cache (exchangeInfo é pesado)
const SYMBOL_INFO_TTL_MS = 6 * 60 * 60 * 1000;
let symbolInfoCache = null;
let symbolInfoFetchedAt = 0;

export async function getSymbolInfo() {
	if (symbolInfoCache && Date.now() - symbolInfoFetchedAt < SYMBOL_INFO_TTL_MS) {
		return symbolInfoCache;
	}

	const { symbols } = await publicGet("/api/v3/exchangeInfo");
	const map = {};
	for (const s of symbols) {
		map[s.symbol] = { baseAsset: s.baseAsset, quoteAsset: s.quoteAsset };
	}

	symbolInfoCache = map;
	symbolInfoFetchedAt = Date.now();
	return map;
}

const KNOWN_QUOTES_REGEX =
	/^(.+?)(USDT|FDUSD|USDC|BUSD|BTC|ETH|BNB|BRL|EUR|TRY)$/;

export function resolveSymbol(symbol, symbolInfo) {
	if (symbolInfo?.[symbol]) return symbolInfo[symbol];

	// fallback caso exchangeInfo falhe: identifica a moeda de cotação pelo sufixo
	const match = symbol.match(KNOWN_QUOTES_REGEX);
	if (match) return { baseAsset: match[1], quoteAsset: match[2] };
	return { baseAsset: symbol, quoteAsset: null };
}

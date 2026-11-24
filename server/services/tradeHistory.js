// Histórico de trades das moedas em carteira + cotações diárias para convertê-los em USDT.
// Compartilhado por /positions (P&L) e /executed-orders.
import { DAY_MS } from "../config.js";
import { cached, mapLimit, SHORT_CACHE_MS } from "../lib/cache.js";
import { getAccountBalances, getAllMyTrades } from "../binance/account.js";
import { publicGet } from "../binance/client.js";
import { getAllPrices, getPriceInUSDT, getSymbolInfo, resolveSymbol } from "../binance/market.js";

// Moedas de cotação em que procuramos trades de cada ativo
export const PNL_QUOTES = ["USDT", "FDUSD", "USDC", "BUSD", "BRL", "BTC", "ETH", "BNB"];
// Cotações tratadas como 1:1 com USDT no histórico
export const USD_STABLES = new Set(["USDT", "FDUSD", "USDC", "BUSD"]);
// Ativos para os quais não faz sentido calcular P&L
const NO_PNL_ASSETS = new Set([...USD_STABLES, "BRL"]);
// Ativos sem P&L cujos trades ainda assim são carregados (pares em que são a base, ex.: USDTBRL)
const TRADES_ONLY_ASSETS = ["USDT"];

// ---------------------------------------------------------------------------
// Cotação diária histórica (fechamento 1d) de um ativo em USDT, para converter
// trades feitos em BRL/BTC/ETH/BNB e taxas pagas em BNB para USDT na data do trade.
// ---------------------------------------------------------------------------
const dailyRateCache = new Map(); // asset -> { rates: Map(dayStart -> rate), from, fetchedAt }

async function fetchDailyCloses(symbol, startTime) {
	const closes = new Map();
	let from = startTime;

	while (from < Date.now()) {
		const rows = await publicGet(`/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${from}&limit=1000`);
		for (const k of rows) closes.set(k[0], Number(k[4]));
		if (rows.length < 1000) break;
		from = rows.at(-1)[0] + DAY_MS;
	}
	return closes;
}

async function loadDailyRates(asset, startTime, prices) {
	if (USD_STABLES.has(asset)) return;

	const dayStart = Math.floor(startTime / DAY_MS) * DAY_MS;
	const hit = dailyRateCache.get(asset);
	if (hit && hit.from <= dayStart && Date.now() - hit.fetchedAt < DAY_MS) return;

	let rates = new Map();
	if (prices[`${asset}USDT`]) {
		rates = await fetchDailyCloses(`${asset}USDT`, dayStart);
	} else if (prices[`USDT${asset}`]) {
		const inverted = await fetchDailyCloses(`USDT${asset}`, dayStart);
		for (const [day, close] of inverted) rates.set(day, close ? 1 / close : 0);
	}

	dailyRateCache.set(asset, { rates, from: dayStart, fetchedAt: Date.now() });
}

// Valor de 1 `asset` em USDT no dia `time`; cai para a cotação atual se não houver histórico
export function rateToUSDTAt(asset, time, prices) {
	if (USD_STABLES.has(asset)) return 1;

	const day = Math.floor(time / DAY_MS) * DAY_MS;
	const rate = dailyRateCache.get(asset)?.rates.get(day);
	if (rate) return rate;

	return getPriceInUSDT(asset, prices) ?? 0;
}

// ---------------------------------------------------------------------------
// Histórico de trades
// ---------------------------------------------------------------------------

// O `cached` garante uma única sincronização por vez (o cache de trades é incremental).
export function loadTradeHistory() {
	return cached("tradeHistory", SHORT_CACHE_MS, fetchTradeHistory);
}

async function fetchTradeHistory() {
	const [balances, prices, symbolInfo] = await Promise.all([
		getAccountBalances(),
		getAllPrices(),
		getSymbolInfo(),
	]);

	const holdings = balances
		.map((b) => ({ asset: b.asset, qty: Number(b.free) + Number(b.locked) }))
		.filter(
			(b) => b.qty > 0 && !NO_PNL_ASSETS.has(b.asset) && !b.asset.startsWith("LD")
		);

	// símbolos existentes para cada ativo nas cotações suportadas
	const symbolsByAsset = {};
	for (const [symbol, info] of Object.entries(symbolInfo)) {
		if (PNL_QUOTES.includes(info.quoteAsset)) {
			(symbolsByAsset[info.baseAsset] ||= []).push(symbol);
		}
	}

	// USDT fica fora do P&L, mas os trades dele (par USDTBRL) entram no histórico: aparecem em Ordens
	// Executadas e no gráfico USDT/BRL
	const tradedAssets = [...holdings.map((h) => h.asset), ...TRADES_ONLY_ASSETS];
	const jobs = tradedAssets.flatMap((asset) =>
		(symbolsByAsset[asset] || []).map((symbol) => ({ asset, symbol }))
	);

	const errors = [];
	const tradesByAsset = {};

	await mapLimit(jobs, 4, async ({ asset, symbol }) => {
		try {
			const trades = await getAllMyTrades(symbol, { tradable: symbolInfo[symbol]?.status === "TRADING" });
			if (trades.length) (tradesByAsset[asset] ||= []).push(...trades);
		} catch (err) {
			// rate limit: aborta tudo em vez de martelar a API
			if (err.status === 429 || err.status === 418) throw err;
			errors.push({ symbol, error: err.message });
		}
	});

	await loadRatesForTrades(Object.values(tradesByAsset).flat(), symbolInfo, prices, errors);

	return { holdings, prices, symbolInfo, tradesByAsset, errors };
}

// Carrega as cotações diárias das moedas de cotação/taxa usadas em `trades` (desde o 1º trade de cada uma),
// para rateToUSDTAt converter na data do trade. Quem chama rateToUSDTAt sobre trades precisa chamar isto antes.
// Falhas vão para `errors` (a conversão cai para a cotação atual).
export async function loadRatesForTrades(trades, symbolInfo, prices, errors = []) {
	const earliestByAsset = {};
	for (const t of trades) {
		const { quoteAsset } = resolveSymbol(t.symbol, symbolInfo);
		for (const a of [quoteAsset, t.commissionAsset]) {
			if (!a || USD_STABLES.has(a)) continue;
			earliestByAsset[a] = Math.min(earliestByAsset[a] ?? Infinity, t.time);
		}
	}
	await mapLimit(Object.entries(earliestByAsset), 4, ([a, start]) =>
		loadDailyRates(a, start, prices).catch((err) =>
			errors.push({ symbol: `${a} (histórico)`, error: err.message })
		)
	);
}

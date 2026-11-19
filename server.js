// server.js

process.loadEnvFile();
import express from "express";
import crypto from "node:crypto";
import fetch from "node-fetch";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "url";
import livereload from "livereload";
import connectLivereload from "connect-livereload";

// Servir arquivos estáticos (coloque seu .html na pasta 'public')
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS restrito ao próprio dashboard local; requisições sem Origin (curl, mesma origem) seguem liberadas
app.use(
	cors({
		origin(origin, callback) {
			const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
			callback(null, !origin || allowed.includes(origin));
		},
	})
);

// ==================== LIVERELOAD ====================
// Escuta mudanças na pasta public e recarrega o navegador
const liveReloadServer = livereload.createServer({
	exts: ["js", "css", "html", "jpg", "png", "jpeg", "gif", "svg"], // extensões monitoradas
});
liveReloadServer.watch(path.join(__dirname, "public"));

// Injeta o script do livereload no HTML servido
app.use(connectLivereload());
// ====================================================

app.use(express.static(path.join(__dirname, "public")));
// Serve a pasta public inteira no caminho /site
app.use("/site", express.static(path.join(__dirname, "public")));

// Opcional: redireciona /site para o index.html automaticamente
app.get("/site", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = Number(process.env.PORT);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
	console.error("Erro: defina PORT no .env com uma porta entre 1 e 65535");
	process.exit(1);
}

const { BINANCE_API_KEY, BINANCE_API_SECRET } = process.env;
const BASE_URL = "https://api.binance.com";

if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
	console.error("Erro: defina BINANCE_API_KEY e BINANCE_API_SECRET no .env");
	process.exit(1);
}

app.listen(PORT, onStartup());

function onStartup() {
	console.log(`🚀 API rodando em:
   • http://localhost:${PORT}/balances          (carteira filtrada)
   • http://localhost:${PORT}/raw               (dados crus da Binance)
   • http://localhost:${PORT}/positions         (preço médio e P&L por moeda)
   • http://localhost:${PORT}/orders            (ordens abertas agrupadas por ativo)
   • http://localhost:${PORT}/orders/:asset     (ordens abertas para ativo específico)
   • http://localhost:${PORT}/executed-orders   (ordens executadas)
   • http://localhost:${PORT}/price-chart/:asset (gráfico de preço, ?range=7d|30d|90d|1y|all ou <n>d|<n>m|<n>y)
   • http://localhost:${PORT}/site              (dashboard com HTML/CSS/JS)
  `);
}

// -----------------------------------------------------------------------------
// ROTAS
// -----------------------------------------------------------------------------

// 🔥 NOVO: retorna o JSON cru da Binance
app.get("/raw", async (req, res) => {
	try {
		const data = await getRawBinanceAccount();
		res.json(data);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

// Rota refinada com cálculos
app.get("/balances", async (req, res) => {
	try {
		const data = await buildWalletData();
		res.json(data);
	} catch (err) {
		res.status(500).json({ error: err.toString() });
	}
});

// Preço médio, custo e P&L (realizado e não realizado) por moeda
app.get("/positions", async (req, res) => {
	try {
		const data = await buildPositions();
		res.json(data);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

// Compat: mapa asset -> preço médio de compra (USDT)
app.get("/avg-buy-prices", async (req, res) => {
	try {
		const { positions } = await buildPositions();
		const map = {};
		for (const p of Object.values(positions)) map[p.asset] = p.avgBuyPriceUSDT;
		res.json(map);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

app.get("/orders", async (req, res) => {
	try {
		const orders = await buildOpenOrders();
		const grouped = groupOrdersByAsset(orders);
		res.json(grouped);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

// Ordens executadas (agrupadas a partir dos trades)
app.get("/executed-orders", async (req, res) => {
	try {
		res.json(await buildExecutedOrders());
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

// Série de preços de uma moeda em USDT.
//   ?interval=1h|4h|1d|1w|1M [&limit=1..1000] [&before=ms]  → velas desse tamanho (usado pelo gráfico)
//   ?range=7d|30d|90d|1y|all ou <n>d|<n>m|<n>y [&before=ms] → tamanho escolhido pelo período (compat.)
app.get("/price-chart/:asset", async (req, res) => {
	const asset = String(req.params.asset).toUpperCase();
	if (!/^[A-Z0-9]{1,20}$/.test(asset)) {
		return res.status(400).json({ error: "Moeda inválida" });
	}
	const interval = req.query.interval ? String(req.query.interval) : null;
	if (interval && !CHART_INTERVALS.has(interval)) {
		return res.status(400).json({ error: "Intervalo inválido" });
	}
	try {
		const before = Number(req.query.before);
		const limit = Number(req.query.limit);
		res.json(
			await buildPriceChart(asset, {
				range: String(req.query.range || "30d"),
				interval,
				limit: Number.isInteger(limit) ? Math.min(1000, Math.max(1, limit)) : null,
				before: Number.isFinite(before) && before > 0 ? before : null,
			})
		);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

app.get("/orders/:asset", async (req, res) => {
	try {
		const asset = req.params.asset.toUpperCase();

		const orders = await buildOpenOrders();
		const grouped = groupOrdersByAsset(orders);

		res.json(grouped[asset] || []);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function signQuery(query) {
	return crypto
		.createHmac("sha256", BINANCE_API_SECRET)
		.update(query)
		.digest("hex");
}

// ---- Sincronização de relógio (evita erro -1021 "Timestamp outside of recvWindow") ----
const RECV_WINDOW_MS = 10000;
const TIME_SYNC_INTERVAL_MS = 30 * 60 * 1000;
let serverTimeOffset = 0;

async function syncServerTime() {
	const sentAt = Date.now();
	const res = await fetch(`${BASE_URL}/api/v3/time`);
	if (!res.ok) throw new Error(await res.text());
	const { serverTime } = await res.json();
	const receivedAt = Date.now();
	// compensa metade da latência da ida e volta
	serverTimeOffset = serverTime - Math.round((sentAt + receivedAt) / 2);
}

syncServerTime().catch((err) =>
	console.warn("Aviso: não foi possível sincronizar o relógio com a Binance:", err.message)
);
setInterval(() => syncServerTime().catch(() => {}), TIME_SYNC_INTERVAL_MS).unref();

// GET assinado com recvWindow e timestamp corrigido; em -1021 ressincroniza e tenta de novo
async function signedGet(pathname, params = {}, retried = false) {
	const query = new URLSearchParams({
		...params,
		recvWindow: RECV_WINDOW_MS,
		timestamp: Date.now() + serverTimeOffset,
	}).toString();
	const signature = signQuery(query);

	const res = await fetch(`${BASE_URL}${pathname}?${query}&signature=${signature}`, {
		headers: { "X-MBX-APIKEY": BINANCE_API_KEY },
	});

	if (!res.ok) {
		const text = await res.text();
		if (!retried && text.includes("-1021")) {
			await syncServerTime();
			return signedGet(pathname, params, true);
		}
		const err = new Error(text);
		err.status = res.status;
		throw err;
	}
	return res.json();
}

// ---- Cache curto: evita repetir chamadas iguais em recargas seguidas ----
const SHORT_CACHE_MS = 15 * 1000;
const shortCache = new Map(); // key -> { promise, settledAt }

// Chamadas simultâneas com a mesma chave compartilham a mesma promise;
// o resultado vale por `ttlMs`; erros não ficam em cache.
function cached(key, ttlMs, fn) {
	const hit = shortCache.get(key);
	if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < ttlMs)) {
		return hit.promise;
	}

	const entry = { promise: null, settledAt: null };
	entry.promise = fn().then(
		(value) => {
			entry.settledAt = Date.now();
			return value;
		},
		(err) => {
			shortCache.delete(key);
			throw err;
		}
	);
	shortCache.set(key, entry);
	return entry.promise;
}

// Retorna dados crus da Binance (inclui balances, permissões, etc.)
async function getRawBinanceAccount() {
	return cached("account", SHORT_CACHE_MS, () => signedGet("/api/v3/account"));
}

// Saldo da conta (para /balances)
async function getAccountBalances() {
	const data = await getRawBinanceAccount();
	return data.balances;
}

// Busca TODAS as cotações
async function getAllPrices() {
	return cached("prices", SHORT_CACHE_MS, fetchAllPrices);
}

async function fetchAllPrices() {
	const res = await fetch(`${BASE_URL}/api/v3/ticker/price`);
	if (!res.ok) throw new Error(await res.text());

	const list = await res.json();
	const priceMap = {};
	for (const item of list) {
		priceMap[item.symbol] = Number(item.price);
	}
	return priceMap;
}

// Cotações atuais + preço de 24h atrás (abertura da janela móvel de 24h)
async function getTickers24h() {
	return cached("tickers24h", SHORT_CACHE_MS, fetchTickers24h);
}

async function fetchTickers24h() {
	const res = await fetch(`${BASE_URL}/api/v3/ticker/24hr?type=MINI`);
	if (!res.ok) throw new Error(await res.text());

	const list = await res.json();
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
function getPriceInUSDT(asset, prices) {
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

async function getSymbolInfo() {
	if (symbolInfoCache && Date.now() - symbolInfoFetchedAt < SYMBOL_INFO_TTL_MS) {
		return symbolInfoCache;
	}

	const res = await fetch(`${BASE_URL}/api/v3/exchangeInfo`);
	if (!res.ok) throw new Error(await res.text());

	const { symbols } = await res.json();
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

function resolveSymbol(symbol, symbolInfo) {
	if (symbolInfo?.[symbol]) return symbolInfo[symbol];

	// fallback caso exchangeInfo falhe: identifica a moeda de cotação pelo sufixo
	const match = symbol.match(KNOWN_QUOTES_REGEX);
	if (match) return { baseAsset: match[1], quoteAsset: match[2] };
	return { baseAsset: symbol, quoteAsset: null };
}

function sortByPercentage(rows) {
	return rows.sort((a, b) => b.pct - a.pct);
}

// Monta dados refinados (rota /balances)
async function buildWalletData() {
	const [balances, { prices: allPrices, openPrices }] = await Promise.all([
		getAccountBalances(),
		getTickers24h(),
	]);

	const nonZero = balances.filter(
		(b) => Number(b.free) > 0 || Number(b.locked) > 0
	);

	const usdtBrlPrice = Number(allPrices.USDTBRL || 0);

	const rows = [];
	const unpriced = [];

	for (const b of nonZero) {
		const asset = b.asset;
		const free = Number(b.free);
		const locked = Number(b.locked);

		const price = getPriceInUSDT(asset, allPrices);

		if (price === null) {
			unpriced.push({ asset, qty: free + locked });
			continue;
		}

		const freeUSDT = free * price;
		const lockedUSDT = locked * price;
		const totalUSDT = freeUSDT + lockedUSDT;

		// variação de 24h em USDT (para BRL inclui a variação do câmbio)
		const openPrice = getPriceInUSDT(asset, openPrices);
		const totalUSDT24hAgo = openPrice ? (free + locked) * openPrice : null;

		rows.push({
			asset,
			qty: free + locked,
			priceUSDT: price,
			freeUSDT,
			lockedUSDT,
			totalUSDT,
			change24hPct: openPrice ? (price / openPrice - 1) * 100 : null,
			change24hUSDT: totalUSDT24hAgo !== null ? totalUSDT - totalUSDT24hAgo : null,
		});
	}

	const totalWalletUSDT = rows.reduce((acc, r) => acc + r.totalUSDT, 0);

	// variação da carteira considerando as quantidades atuais (ignora trades feitos nas 24h)
	const withChange = rows.filter((r) => r.change24hUSDT !== null);
	const change24hUSDT = withChange.reduce((acc, r) => acc + r.change24hUSDT, 0);
	const value24hAgo = withChange.reduce(
		(acc, r) => acc + r.totalUSDT - r.change24hUSDT,
		0
	);

	const processed = rows.map((r) => ({
		...r,
		pct: totalWalletUSDT ? (r.totalUSDT / totalWalletUSDT) * 100 : 0,
	}));

	return {
		total_usdt: totalWalletUSDT,
		usdt_brl_price: usdtBrlPrice || null,
		change_24h_usdt: change24hUSDT,
		change_24h_pct: value24hAgo ? (change24hUSDT / value24hAgo) * 100 : null,
		assets: sortByPercentage(processed),
		unpriced,
	};
}

// Ordens abertas com base/quote resolvidos e total convertido para USDT
async function buildOpenOrders() {
	const [orders, prices, symbolInfo] = await Promise.all([
		getOpenOrders(),
		getAllPrices(),
		getSymbolInfo().catch(() => null),
	]);

	return orders.map((order) => {
		const { baseAsset, quoteAsset } = resolveSymbol(order.symbol, symbolInfo);

		// ordens STOP_LOSS/TAKE_PROFIT (a mercado) têm price = 0; usa o stopPrice
		const price = Number(order.price) || Number(order.stopPrice) || 0;
		// em ordens parcialmente executadas, só o restante continua em aberto
		const remainingQty = Number(order.origQty) - Number(order.executedQty || 0);
		const totalQuote = price * remainingQty;

		const quotePriceUSDT = quoteAsset
			? getPriceInUSDT(quoteAsset, prices)
			: null;

		// preço atual do par e quanto falta (em %) para a ordem executar
		const currentPrice = prices[order.symbol] || null;
		const distancePct = currentPrice ? ((price - currentPrice) / currentPrice) * 100 : null;
		// valor atual de mercado da quantidade em aberto (base a preço de agora), em USDT
		const marketValueUSDT =
			currentPrice && quotePriceUSDT !== null
				? remainingQty * currentPrice * quotePriceUSDT
				: null;

		return {
			...order,
			baseAsset,
			quoteAsset,
			remainingQty,
			totalQuote,
			quotePriceUSDT,
			totalUSDT: quotePriceUSDT !== null ? totalQuote * quotePriceUSDT : null,
			currentPrice,
			distancePct,
			marketValueUSDT,
		};
	});
}

async function getOpenOrders() {
	return cached("openOrders", SHORT_CACHE_MS, () => signedGet("/api/v3/openOrders"));
}

function groupOrdersByAsset(orders) {
	const map = {};

	for (const order of orders) {
		const asset = order.baseAsset;

		if (!map[asset]) map[asset] = [];
		map[asset].push(order);
	}

	return map;
}

// -----------------------------------------------------------------------------
// POSIÇÕES / P&L (rota /positions)
// -----------------------------------------------------------------------------

// Moedas de cotação em que procuramos trades de cada ativo
const PNL_QUOTES = ["USDT", "FDUSD", "USDC", "BUSD", "BRL", "BTC", "ETH", "BNB"];
// Cotações tratadas como 1:1 com USDT no histórico
const USD_STABLES = new Set(["USDT", "FDUSD", "USDC", "BUSD"]);
// Ativos para os quais não faz sentido calcular P&L
const NO_PNL_ASSETS = new Set([...USD_STABLES, "BRL"]);

const TRADES_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Executa `fn` sobre `items` com no máximo `limit` chamadas simultâneas
async function mapLimit(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const idx = next++;
			results[idx] = await fn(items[idx], idx);
		}
	});
	await Promise.all(workers);
	return results;
}

// Cache incremental de trades por símbolo: na 1ª vez baixa tudo (paginando por
// fromId), depois só busca trades com id maior que o último conhecido.
const tradesCache = new Map(); // symbol -> { trades, lastSync }

async function getAllMyTrades(symbol) {
	const entry = tradesCache.get(symbol) || { trades: [], lastSync: 0 };
	if (Date.now() - entry.lastSync < TRADES_TTL_MS) return entry.trades;

	let fromId = entry.trades.length ? entry.trades.at(-1).id + 1 : 0;

	while (true) {
		const page = await signedGet("/api/v3/myTrades", { symbol, fromId, limit: 1000 });
		entry.trades.push(...page);
		if (page.length < 1000) break;
		fromId = page.at(-1).id + 1;
	}

	entry.lastSync = Date.now();
	tradesCache.set(symbol, entry);
	return entry.trades;
}

// Cotação diária histórica (fechamento 1d) de um ativo em USDT, para converter
// trades feitos em BRL/BTC/ETH/BNB e taxas pagas em BNB para USDT na data do trade.
const dailyRateCache = new Map(); // asset -> { rates: Map(dayStart -> rate), from, fetchedAt }

async function fetchDailyCloses(symbol, startTime) {
	const closes = new Map();
	let from = startTime;

	while (from < Date.now()) {
		const url = `${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${from}&limit=1000`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(await res.text());

		const rows = await res.json();
		for (const k of rows) closes.set(k[0], Number(k[4]));
		if (rows.length < 1000) break;
		from = rows.at(-1)[0] + DAY_MS;
	}
	return closes;
}

async function loadDailyRates(asset, startTime, prices) {
	if (USD_STABLES.has(asset)) return;

	const dayStart = Math.floor(startTime / DAY_MS) * DAY_MS;
	const cached = dailyRateCache.get(asset);
	if (cached && cached.from <= dayStart && Date.now() - cached.fetchedAt < DAY_MS) return;

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
function rateToUSDTAt(asset, time, prices) {
	if (USD_STABLES.has(asset)) return 1;

	const day = Math.floor(time / DAY_MS) * DAY_MS;
	const rate = dailyRateCache.get(asset)?.rates.get(day);
	if (rate) return rate;

	return getPriceInUSDT(asset, prices) ?? 0;
}

// Custo médio ponderado: compras aumentam quantidade e custo; vendas baixam a
// quantidade pelo custo médio vigente (o preço médio não muda) e geram lucro realizado.
// Taxas: em base reduzem a quantidade; em outra moeda (quote/BNB) entram no custo/receita.
function computePosition(asset, trades, prices, symbolInfo) {
	let qty = 0;
	let cost = 0;
	let realized = 0;
	let invested = 0;

	for (const t of trades) {
		const { quoteAsset } = resolveSymbol(t.symbol, symbolInfo);
		const tradeQty = Number(t.qty);
		const valueUSDT = Number(t.quoteQty) * rateToUSDTAt(quoteAsset, t.time, prices);

		const commission = Number(t.commission || 0);
		const feeInBase = t.commissionAsset === asset ? commission : 0;
		const feeUSDT =
			t.commissionAsset && t.commissionAsset !== asset
				? commission * rateToUSDTAt(t.commissionAsset, t.time, prices)
				: 0;

		if (t.isBuyer) {
			qty += tradeQty - feeInBase;
			cost += valueUSDT + feeUSDT;
			invested += valueUSDT + feeUSDT;
		} else {
			const soldQty = tradeQty + feeInBase;
			const matchedQty = Math.min(soldQty, qty);
			const avg = qty > 0 ? cost / qty : 0;
			const proceeds = valueUSDT - feeUSDT;

			// se vendeu mais do que os trades explicam (ex.: veio de depósito), só a
			// parte com custo conhecido entra no realizado
			realized += proceeds * (soldQty ? matchedQty / soldQty : 0) - avg * matchedQty;
			cost -= avg * matchedQty;
			qty -= matchedQty;
		}

		if (qty < 1e-12) {
			qty = 0;
			cost = 0;
		}
	}

	return {
		trackedQty: qty,
		avgBuyPriceUSDT: qty > 0 ? cost / qty : null,
		realizedPnlUSDT: realized,
		investedUSDT: invested,
	};
}

async function buildPositions() {
	return computeAllPositions();
}

// Trades de todas as moedas em carteira + cotações diárias necessárias para
// convertê-los em USDT. Compartilhado por /positions e /executed-orders; o
// `cached` garante uma única sincronização por vez (o cache de trades é incremental).
function loadTradeHistory() {
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

	const jobs = holdings.flatMap((h) =>
		(symbolsByAsset[h.asset] || []).map((symbol) => ({ asset: h.asset, symbol }))
	);

	const errors = [];
	const tradesByAsset = {};

	await mapLimit(jobs, 4, async ({ asset, symbol }) => {
		try {
			const trades = await getAllMyTrades(symbol);
			if (trades.length) (tradesByAsset[asset] ||= []).push(...trades);
		} catch (err) {
			// rate limit: aborta tudo em vez de martelar a API
			if (err.status === 429 || err.status === 418) throw err;
			errors.push({ symbol, error: err.message });
		}
	});

	// carrega cotações diárias das moedas de cotação/taxa usadas (desde o 1º trade)
	const earliestByAsset = {};
	for (const trades of Object.values(tradesByAsset)) {
		for (const t of trades) {
			const { quoteAsset } = resolveSymbol(t.symbol, symbolInfo);
			for (const a of [quoteAsset, t.commissionAsset]) {
				if (!a || USD_STABLES.has(a)) continue;
				earliestByAsset[a] = Math.min(earliestByAsset[a] ?? Infinity, t.time);
			}
		}
	}
	await mapLimit(Object.entries(earliestByAsset), 4, ([a, start]) =>
		loadDailyRates(a, start, prices).catch((err) =>
			errors.push({ symbol: `${a} (histórico)`, error: err.message })
		)
	);

	return { holdings, prices, symbolInfo, tradesByAsset, errors };
}

async function computeAllPositions() {
	const { holdings, prices, symbolInfo, tradesByAsset, errors } = await loadTradeHistory();

	const positions = {};
	for (const h of holdings) {
		const trades = [...(tradesByAsset[h.asset] || [])].sort(
			(a, b) => a.time - b.time || a.id - b.id
		);
		const currentPrice = getPriceInUSDT(h.asset, prices);
		const pos = computePosition(h.asset, trades, prices, symbolInfo);

		const avg = pos.avgBuyPriceUSDT;
		const costBasisUSDT = avg !== null ? avg * h.qty : null;
		const marketValueUSDT = currentPrice !== null ? currentPrice * h.qty : null;
		const unrealizedPnlUSDT =
			costBasisUSDT !== null && marketValueUSDT !== null
				? marketValueUSDT - costBasisUSDT
				: null;

		positions[h.asset] = {
			asset: h.asset,
			qty: h.qty,
			currentPriceUSDT: currentPrice,
			avgBuyPriceUSDT: avg,
			costBasisUSDT,
			marketValueUSDT,
			unrealizedPnlUSDT,
			unrealizedPnlPct:
				unrealizedPnlUSDT !== null && costBasisUSDT
					? (unrealizedPnlUSDT / costBasisUSDT) * 100
					: null,
			realizedPnlUSDT: pos.realizedPnlUSDT,
			investedUSDT: pos.investedUSDT,
			// quanto da quantidade atual é explicada pelos trades (depósitos/Convert/Earn não entram)
			coverage: h.qty > 0 ? Math.min(pos.trackedQty / h.qty, 1) : 0,
			tradesCount: trades.length,
			symbols: [...new Set(trades.map((t) => t.symbol))],
		};
	}

	const withCost = Object.values(positions).filter((p) => p.costBasisUSDT !== null);
	const total = (list, key) => list.reduce((acc, p) => acc + (p[key] ?? 0), 0);
	const totalCost = total(withCost, "costBasisUSDT");
	const totalUnrealized = total(withCost, "unrealizedPnlUSDT");

	return {
		positions,
		totals: {
			costBasisUSDT: totalCost,
			marketValueUSDT: total(withCost, "marketValueUSDT"),
			unrealizedPnlUSDT: totalUnrealized,
			unrealizedPnlPct: totalCost ? (totalUnrealized / totalCost) * 100 : null,
			realizedPnlUSDT: total(Object.values(positions), "realizedPnlUSDT"),
		},
		errors,
		generatedAt: Date.now(),
	};
}

// -----------------------------------------------------------------------------
// ORDENS EXECUTADAS (rota /executed-orders)
// -----------------------------------------------------------------------------

// Agrupa os trades (fills) por ordem. Usa o mesmo histórico do P&L, então cobre
// as moedas que estão em carteira hoje (moedas já zeradas não aparecem).
async function buildExecutedOrders() {
	const { prices, symbolInfo, tradesByAsset, errors } = await loadTradeHistory();

	const byOrder = new Map();
	for (const trades of Object.values(tradesByAsset)) {
		for (const t of trades) {
			const key = `${t.symbol}:${t.orderId}`;
			let order = byOrder.get(key);
			if (!order) {
				const { baseAsset, quoteAsset } = resolveSymbol(t.symbol, symbolInfo);
				order = {
					symbol: t.symbol,
					orderId: t.orderId,
					baseAsset,
					quoteAsset,
					side: t.isBuyer ? "BUY" : "SELL",
					qty: 0,
					quoteQty: 0,
					totalUSDT: 0,
					fees: {},
					feeUSDT: 0,
					fills: 0,
					time: t.time,
				};
				byOrder.set(key, order);
			}

			const quoteRate = rateToUSDTAt(order.quoteAsset, t.time, prices);
			const commission = Number(t.commission || 0);

			order.qty += Number(t.qty);
			order.quoteQty += Number(t.quoteQty);
			order.totalUSDT += Number(t.quoteQty) * quoteRate;
			order.fees[t.commissionAsset] = (order.fees[t.commissionAsset] || 0) + commission;
			// taxa paga na própria moeda é convertida pelo preço do fill
			order.feeUSDT +=
				t.commissionAsset === order.baseAsset
					? commission * Number(t.price) * quoteRate
					: commission * rateToUSDTAt(t.commissionAsset, t.time, prices);
			order.fills += 1;
			order.time = Math.max(order.time, t.time);
		}
	}

	const orders = [...byOrder.values()]
		.map((o) => ({ ...o, avgPrice: o.qty ? o.quoteQty / o.qty : 0 }))
		.sort((a, b) => b.time - a.time);

	return { orders, errors, generatedAt: Date.now() };
}

// -----------------------------------------------------------------------------
// GRÁFICO DE PREÇO (rota /price-chart/:asset)
// -----------------------------------------------------------------------------

const CHART_RANGES = {
	"7d": { interval: "1h", limit: 168 },
	"30d": { interval: "4h", limit: 180 },
	"90d": { interval: "1d", limit: 90 },
	"1y": { interval: "1d", limit: 365 },
	all: { interval: "1w", limit: 1000 },
};

// Período customizado: "<n>d" | "<n>m" | "<n>y" (dias, meses, anos).
// Escolhe o menor intervalo de vela que mantém o gráfico em até ~500 pontos.
const CUSTOM_RANGE_UNIT_DAYS = { d: 1, m: 30, y: 365 };
const CUSTOM_RANGE_INTERVALS = [
	{ interval: "1h", hours: 1 },
	{ interval: "4h", hours: 4 },
	{ interval: "1d", hours: 24 },
	{ interval: "1w", hours: 24 * 7 },
];

function parseCustomRange(range) {
	const m = /^(\d{1,4})([dmy])$/.exec(range);
	if (!m) return null;
	const days = Number(m[1]) * CUSTOM_RANGE_UNIT_DAYS[m[2]];
	if (days < 1) return null;

	const totalHours = days * 24;
	const choice =
		CUSTOM_RANGE_INTERVALS.find((c) => totalHours / c.hours <= 500) ||
		CUSTOM_RANGE_INTERVALS.at(-1);
	return {
		interval: choice.interval,
		limit: Math.min(1000, Math.ceil(totalHours / choice.hours)),
	};
}

// Tamanhos de vela aceitos explicitamente (todos existem na Binance)
const CHART_INTERVALS = new Set(["1h", "4h", "1d", "1w", "1M"]);

// Página de velas anteriores (histórico carregado ao arrastar o gráfico para o passado)
const OLDER_PAGE_LIMIT = 500;

// interval: tamanho da vela explícito (senão vem do range); before (ms): velas que terminam antes desse instante
async function buildPriceChart(asset, { range = "30d", interval = null, limit = null, before = null } = {}) {
	const base = CHART_RANGES[range] || parseCustomRange(range) || CHART_RANGES["30d"];
	const config = interval
		? { interval, limit: limit || 1000 }
		: before
			? { interval: base.interval, limit: OLDER_PAGE_LIMIT }
			: base;
	const endParam = before ? `&endTime=${before - 1}` : "";
	const prices = await getAllPrices();

	let symbol = `${asset}USDT`;
	let inverted = false;
	if (!prices[symbol]) {
		if (!prices[`USDT${asset}`]) throw new Error(`Não existe par ${asset}/USDT na Binance`);
		symbol = `USDT${asset}`;
		inverted = true;
	}

	return cached(`chart:${symbol}:${config.interval}:${config.limit}:${before || ""}`, 60 * 1000, async () => {
		const url = `${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${config.interval}&limit=${config.limit}${endParam}`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(await res.text());
		const rows = await res.json();

		return {
			asset,
			symbol,
			interval: config.interval,
			points: rows.map((k) => {
				const [open, high, low, close] = [k[1], k[2], k[3], k[4]].map(Number);
				if (!inverted) return { time: k[0], open, high, low, close };
				// par invertido (USDT/X): 1/preço — máxima e mínima trocam de lugar
				const inv = (v) => (v ? 1 / v : 0);
				return { time: k[0], open: inv(open), high: inv(low), low: inv(high), close: inv(close) };
			}),
		};
	});
}

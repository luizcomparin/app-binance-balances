// Dados da conta (endpoints assinados): saldos, ordens abertas e histórico de trades.
import { cached, SHORT_CACHE_MS } from "../lib/cache.js";
import { signedGet } from "./client.js";

// Retorna dados crus da Binance (inclui balances, permissões, etc.)
export async function getRawBinanceAccount() {
	return cached("account", SHORT_CACHE_MS, () => signedGet("/api/v3/account"));
}

// Saldo da conta (para /balances)
export async function getAccountBalances() {
	const data = await getRawBinanceAccount();
	return data.balances;
}

export async function getOpenOrders() {
	return cached("openOrders", SHORT_CACHE_MS, () => signedGet("/api/v3/openOrders"));
}

// Últimas 1000 ordens de um símbolo, de qualquer status (executadas, canceladas, expiradas, abertas)
const ALL_ORDERS_TTL_MS = 60 * 1000;
export async function getAllOrders(symbol) {
	return cached(`allOrders:${symbol}`, ALL_ORDERS_TTL_MS, () => signedGet("/api/v3/allOrders", { symbol, limit: 1000 }));
}

// Cache incremental de trades por símbolo: na 1ª vez baixa tudo (paginando por
// fromId), depois só busca trades com id maior que o último conhecido.
// Cada consulta pesa 20 e a carteira cruza centenas de pares, então o intervalo depende do par:
//   - par que não negocia mais (delistado/pausado): consultado uma única vez;
//   - par sem nenhum trade seu: a cada 30 min (é raro começar a negociar um par novo);
//   - par com trades: a cada 5 min.
const TRADES_TTL_MS = 5 * 60 * 1000;
const EMPTY_TRADES_TTL_MS = 30 * 60 * 1000;
const tradesCache = new Map(); // symbol -> { trades, lastSync }
// sincronização em andamento por símbolo: chamadas simultâneas (P&L, histórico de trades, histórico de
// ordens) esperam a mesma em vez de buscar a mesma página duas vezes e duplicar os trades no cache
const syncing = new Map(); // symbol -> promise

// as chaves da API mudaram: os trades guardados eram de outra conta
export function clearTradesCache() {
	tradesCache.clear();
}

export function getAllMyTrades(symbol, opts) {
	const running = syncing.get(symbol);
	if (running) return running;
	const promise = syncTrades(symbol, opts).finally(() => syncing.delete(symbol));
	syncing.set(symbol, promise);
	return promise;
}

async function syncTrades(symbol, { tradable = true } = {}) {
	const entry = tradesCache.get(symbol) || { trades: [], lastSync: 0 };
	if (entry.lastSync && !tradable) return entry.trades;
	const ttl = entry.trades.length ? TRADES_TTL_MS : EMPTY_TRADES_TTL_MS;
	if (Date.now() - entry.lastSync < ttl) return entry.trades;

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

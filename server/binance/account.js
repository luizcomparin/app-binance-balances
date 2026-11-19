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

// Cache incremental de trades por símbolo: na 1ª vez baixa tudo (paginando por
// fromId), depois só busca trades com id maior que o último conhecido.
const TRADES_TTL_MS = 5 * 60 * 1000;
const tradesCache = new Map(); // symbol -> { trades, lastSync }

export async function getAllMyTrades(symbol) {
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

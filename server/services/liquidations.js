// Liquidações REAIS dos futuros perpétuos USDT de uma moeda (rota /liquidations/:asset), somando
// Binance + Bybit + OKX, a partir do histórico agregado da Coinalyze.
//
// Ao contrário do mapa de liquidação (estimativa de onde ainda haveria liquidações), aqui é o que de fato
// foi liquidado em cada período: valor em US$ das posições compradas (long) e vendidas (short) encerradas
// à força. Velas de 1h e 4h usam os períodos da Coinalyze; diária, semanal e mensal usam o diário
// (o gráfico soma os dias de cada vela). O histórico intradiário da Coinalyze é curto.
import { cached } from "../lib/cache.js";
import { coinalyzeGet } from "../coinalyze/client.js";
import { getCoinalyzeKey } from "../config.js";
import { LOT_PREFIXES } from "../binance/futures.js";

const DAY = 24 * 60 * 60 * 1000;
const CACHE_MS = 5 * 60 * 1000;
const MARKETS_CACHE_MS = 24 * 60 * 60 * 1000;

// corretoras somadas (nome mostrado → como aparece em /exchanges da Coinalyze)
const EXCHANGES = [
	{ name: "Binance", match: /^binance/i },
	{ name: "Bybit", match: /^bybit/i },
	{ name: "OKX", match: /^(okx|okex)/i },
];

// intervalo do gráfico → intervalo da Coinalyze e quanto pedir para trás
const INTERVALS = {
	"1h": { interval: "1hour", lookbackMs: 120 * DAY },
	"4h": { interval: "4hour", lookbackMs: 2 * 365 * DAY },
	"1d": { interval: "daily", lookbackMs: null },
	"1w": { interval: "daily", lookbackMs: null },
	"1M": { interval: "daily", lookbackMs: null },
};
export const LIQUIDATION_INTERVALS = new Set(Object.keys(INTERVALS));
const DAILY_FROM = Date.UTC(2019, 0, 1); // antes disso quase não há dado de futuros

// moedas de preço muito baixo são negociadas em lotes nos futuros: 1000PEPE, 1000000MOG, 1MBABYDOGE...
const PREFIXES = LOT_PREFIXES.map(([prefix]) => prefix);

/** Contrato perpétuo USDT da moeda em cada corretora: [{ name, symbol }] (código da Coinalyze, ex.: BTCUSDT_PERP.A) */
function marketsFor(asset) {
	return cached("coinalyze:markets", MARKETS_CACHE_MS, async () => {
		const [exchanges, markets] = await Promise.all([coinalyzeGet("/exchanges"), coinalyzeGet("/future-markets")]);
		const codes = new Map(); // código da corretora → nome mostrado
		for (const ex of exchanges || []) {
			const wanted = EXCHANGES.find((e) => e.match.test(String(ex.name || "")));
			if (wanted) codes.set(ex.code, wanted.name);
		}
		// nome da corretora → base_asset → símbolo
		const byExchange = new Map();
		for (const m of markets || []) {
			const name = codes.get(m.exchange);
			if (!name || !m.is_perpetual || String(m.quote_asset).toUpperCase() !== "USDT") continue;
			if (!byExchange.has(name)) byExchange.set(name, new Map());
			const base = String(m.base_asset || "").toUpperCase();
			if (!byExchange.get(name).has(base)) byExchange.get(name).set(base, m.symbol);
		}
		return byExchange;
	}).then((byExchange) => {
		const found = [];
		for (const { name } of EXCHANGES) {
			const bases = byExchange.get(name);
			const symbol = bases && PREFIXES.map((p) => bases.get(`${p}${asset}`)).find(Boolean);
			if (symbol) found.push({ name, symbol });
		}
		return found;
	});
}

export function buildLiquidations(asset, interval) {
	if (!getCoinalyzeKey()) return { asset, available: false, reason: "no-key" };
	return cached(`liquidations:${asset}:${interval}`, CACHE_MS, () => computeLiquidations(asset, interval)).catch((err) => {
		if (err.code === "COINALYZE_KEY_INVALID") return { asset, available: false, reason: "invalid-key", message: err.message };
		return { asset, available: false, reason: "error", message: err.message };
	});
}

async function computeLiquidations(asset, interval) {
	const markets = await marketsFor(asset);
	if (!markets.length) return { asset, available: false, reason: "no-market" };

	const cfg = INTERVALS[interval];
	const to = Date.now();
	const from = cfg.lookbackMs ? to - cfg.lookbackMs : DAILY_FROM;
	const result = await coinalyzeGet("/liquidation-history", {
		symbols: markets.map((m) => m.symbol).join(","),
		interval: cfg.interval,
		from: Math.floor(from / 1000),
		to: Math.floor(to / 1000),
		convert_to_usd: "true",
	});

	// junta as corretoras por instante: t (ms) → { long, short, by: { Binance: { long, short }, ... } }
	const nameOf = new Map(markets.map((m) => [m.symbol, m.name]));
	const rows = new Map();
	const withData = new Set();
	for (const item of result || []) {
		const name = nameOf.get(item.symbol);
		if (!name) continue;
		for (const h of item.history || []) {
			const t = Number(h.t) * 1000;
			const long = Number(h.l) || 0;
			const short = Number(h.s) || 0;
			if (!Number.isFinite(t)) continue;
			let row = rows.get(t);
			if (!row) rows.set(t, (row = { t, long: 0, short: 0, by: {} }));
			row.long += long;
			row.short += short;
			row.by[name] = { long, short };
			withData.add(name);
		}
	}

	return {
		asset,
		available: true,
		interval: cfg.interval,
		// corretoras com o contrato e as que de fato vieram com dados
		exchanges: markets.map((m) => m.name).filter((n) => withData.has(n)),
		rows: [...rows.values()].sort((a, b) => a.t - b.t),
		generatedAt: Date.now(),
	};
}

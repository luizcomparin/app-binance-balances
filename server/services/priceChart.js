// Gráfico de preço (rota /price-chart/:asset): velas OHLC em USDT, por tamanho de vela ou por período.
import { cached } from "../lib/cache.js";
import { publicGet } from "../binance/client.js";
import { getAllPrices } from "../binance/market.js";

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
export const CHART_INTERVALS = new Set(["1h", "4h", "1d", "1w", "1M"]);

// Página de velas anteriores (histórico carregado ao arrastar o gráfico para o passado)
const OLDER_PAGE_LIMIT = 500;

// interval: tamanho da vela explícito (senão vem do range); before (ms): velas que terminam antes desse instante
export async function buildPriceChart(asset, { range = "30d", interval = null, limit = null, before = null } = {}) {
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
		const rows = await publicGet(
			`/api/v3/klines?symbol=${symbol}&interval=${config.interval}&limit=${config.limit}${endParam}`
		);

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

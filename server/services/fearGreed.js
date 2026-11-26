// Crypto Fear & Greed Index (rota /fear-greed): histórico diário completo, da Alternative.me.
//
// O índice vai de 0 (medo extremo) a 100 (ganância extrema), é calculado sobre o mercado (basicamente o
// Bitcoin) e sai uma vez por dia, às 00:00 UTC. É o mesmo para todas as moedas.
import { cached } from "../lib/cache.js";
import { alternativeGet } from "../alternativeme/client.js";

// o índice muda uma vez por dia: 10 min bastam para pegar o valor novo logo depois da virada
const CACHE_MS = 10 * 60 * 1000;

// classificação informada pela API → código usado na página
const CLASSES = {
	"Extreme Fear": "extreme-fear",
	Fear: "fear",
	Neutral: "neutral",
	Greed: "greed",
	"Extreme Greed": "extreme-greed",
};

/**
 * Resposta de /fng/ → [{ t (ms, 00:00 UTC do dia), v (0–100), c (classificação ou null) }] em ordem de
 * tempo, sem dias repetidos e sem linhas inválidas. A API manda números como texto e do mais novo para o mais antigo.
 */
export function parseFearGreed(raw) {
	const byDay = new Map();
	for (const item of raw?.data || []) {
		// (Number("") e Number(null) dão 0: campo vazio não é valor)
		const t = item?.timestamp ? Number(item.timestamp) * 1000 : NaN;
		const v = item?.value === "" || item?.value == null ? NaN : Number(item.value);
		if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(v) || v < 0 || v > 100) continue;
		if (!byDay.has(t)) byDay.set(t, { t, v, c: CLASSES[item.value_classification] || null });
	}
	return [...byDay.values()].sort((a, b) => a.t - b.t);
}

export function buildFearGreed() {
	return cached("fearGreed", CACHE_MS, computeFearGreed).catch((err) => ({ available: false, reason: "error", message: err.message }));
}

async function computeFearGreed() {
	// limit=0: todo o histórico (desde fev/2018, ~1 linha por dia)
	const raw = await alternativeGet("/fng/?limit=0");
	if (raw?.metadata?.error) throw new Error(`Alternative.me: ${raw.metadata.error}`);
	const rows = parseFearGreed(raw);
	if (!rows.length) return { available: false, reason: "no-data" };
	return { available: true, source: "alternative.me", rows, generatedAt: Date.now() };
}

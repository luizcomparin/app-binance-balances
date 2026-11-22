// API da Coinalyze (agregador de dados de derivativos de várias corretoras). Precisa de chave
// gratuita (header "api_key"); limite de ~40 chamadas por minuto por chave.
import { getCoinalyzeKey } from "../config.js";
import { createRateLimiter, limitedFetch, RateLimitError } from "../lib/rateLimit.js";

const BASE_URL = "https://api.coinalyze.net/v1";

// o limite é por chave: um limitador para cada (a chave testada nas Configurações tem o seu); 38 de 40 por minuto
const limiters = new Map(); // chave -> limitador
function limiterFor(key) {
	if (!limiters.has(key)) limiters.set(key, createRateLimiter({ name: "Coinalyze", maxRequests: 38, windowMs: 60000 }));
	return limiters.get(key);
}

// erro com code: "COINALYZE_KEY_MISSING" (sem chave), "COINALYZE_KEY_INVALID" (401) ou "COINALYZE_RATE_LIMIT" (429)
function coinalyzeError(message, code, status) {
	const err = new Error(message);
	err.code = code;
	err.status = status;
	return err;
}

/** GET autenticado; key = chave a usar (padrão: a configurada) */
export async function coinalyzeGet(path, params = {}, key = getCoinalyzeKey()) {
	if (!key) throw coinalyzeError("Chave da Coinalyze não configurada", "COINALYZE_KEY_MISSING");
	const query = new URLSearchParams(params).toString();
	let res;
	try {
		// espera a vez dentro do limite; em 429 tenta de novo depois do Retry-After (se for curto)
		res = await limitedFetch([limiterFor(key)], `${BASE_URL}${path}${query ? `?${query}` : ""}`, { headers: { api_key: key } });
	} catch (err) {
		if (err instanceof RateLimitError) throw coinalyzeError(err.message, "COINALYZE_RATE_LIMIT", 429);
		throw err;
	}
	if (res.status === 401) throw coinalyzeError("A Coinalyze recusou a chave", "COINALYZE_KEY_INVALID", 401);
	if (res.status === 429) {
		const retry = res.headers.get("retry-after");
		throw coinalyzeError(`Limite de requisições da Coinalyze atingido${retry ? ` (tente em ${retry}s)` : ""}`, "COINALYZE_RATE_LIMIT", 429);
	}
	if (!res.ok) throw coinalyzeError(`Coinalyze respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`, "COINALYZE_ERROR", res.status);
	return res.json();
}

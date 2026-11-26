// API pública da Alternative.me (Crypto Fear & Greed Index): sem chave, só leitura.
// O limite informado por eles é de 60 requisições por minuto; ficamos em 30.
import { createRateLimiter, limitedFetch } from "../lib/rateLimit.js";

const BASE_URL = "https://api.alternative.me";

const limiter = createRateLimiter({ name: "Alternative.me", maxRequests: 30, windowMs: 60000 });

export async function alternativeGet(pathAndQuery) {
	const res = await limitedFetch([limiter], `${BASE_URL}${pathAndQuery}`);
	if (!res.ok) {
		const err = new Error(`Alternative.me respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
		err.status = res.status;
		throw err;
	}
	return res.json();
}

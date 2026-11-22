// Limitador de requisições para APIs externas sem controle próprio (Binance Futures, Coinalyze).
// O cliente spot da Binance (binance/client.js) tem o seu, baseado no peso informado em cada resposta.
//
// Cada limitador junta até três proteções:
//   - teto de requisições por janela (maxRequests em windowMs): espera a janela liberar antes de enviar;
//   - teto de peso por minuto (weightHeader + maxWeight): lê o peso já usado do header de cada resposta e,
//     perto do limite, espera o minuto virar;
//   - 429/418: pausa as próximas requisições pelo Retry-After e tenta de novo uma vez.
// Esperas longas não seguram a requisição da página: acima de maxWaitMs, falha na hora com RateLimitError.
import fetch from "node-fetch";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const currentMinute = () => Math.floor(Date.now() / 60000);

export class RateLimitError extends Error {
	constructor(name, waitMs) {
		const seconds = Math.ceil(waitMs / 1000);
		super(`Limite de requisições da ${name} atingido (tente em ${seconds}s)`);
		this.status = 429;
		this.code = "RATE_LIMIT";
		this.retryAfterMs = waitMs;
	}
}

/**
 * name: nome mostrado nas mensagens ("Binance Futures"); maxRequests/windowMs: teto por janela (opcional);
 * weightHeader/maxWeight: peso usado no minuto, informado pela API (opcional); maxWaitMs: maior espera aceita.
 */
export function createRateLimiter({ name, maxRequests = 0, windowMs = 60000, weightHeader = null, maxWeight = 0, maxWaitMs = 15000 }) {
	const sent = []; // instantes das requisições dentro da janela
	let pauseUntil = 0;
	let usedWeight = 0;
	let weightMinute = 0;

	// quanto falta (ms) para poder enviar; 0 = pode agora
	function waitNeeded(now) {
		if (pauseUntil > now) return pauseUntil - now;
		while (sent.length && now - sent[0] >= windowMs) sent.shift();
		if (maxRequests && sent.length >= maxRequests) return windowMs - (now - sent[0]) + 50;
		if (maxWeight) {
			if (currentMinute() !== weightMinute) {
				weightMinute = currentMinute();
				usedWeight = 0;
			}
			if (usedWeight >= maxWeight) return (weightMinute + 1) * 60000 - now + 250;
		}
		return 0;
	}

	return {
		/** espera a vez de enviar (ou lança RateLimitError se a espera passar de maxWaitMs) */
		async acquire() {
			for (;;) {
				const now = Date.now();
				const wait = waitNeeded(now);
				if (!wait) {
					sent.push(now);
					return;
				}
				if (wait > maxWaitMs) throw new RateLimitError(name, wait);
				await sleep(wait);
			}
		},

		/** anota o peso informado e, em 429/418, pausa pelo Retry-After; devolve a pausa (ms) ou 0 */
		record(res) {
			if (weightHeader) {
				const weight = Number(res.headers.get(weightHeader));
				if (weight > 0) {
					weightMinute = currentMinute();
					usedWeight = weight;
				}
			}
			if (res.status !== 429 && res.status !== 418) return 0;
			const retryAfterMs = (Number(res.headers.get("retry-after")) || 60) * 1000;
			pauseUntil = Math.max(pauseUntil, Date.now() + retryAfterMs);
			return retryAfterMs;
		},
	};
}

/**
 * fetch que passa por todos os `limiters` e, em 429/418, tenta mais uma vez depois do Retry-After.
 * Na 2ª tentativa, o acquire() espera a pausa — ou lança RateLimitError se ela passar de maxWaitMs.
 */
export async function limitedFetch(limiters, url, options) {
	for (let attempt = 0; ; attempt++) {
		for (const limiter of limiters) await limiter.acquire();
		const res = await fetch(url, options);
		let paused = false;
		for (const limiter of limiters) if (limiter.record(res)) paused = true;
		if (!paused || attempt === 1) return res;
	}
}

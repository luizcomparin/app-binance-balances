// Cliente HTTP da Binance: GET público e GET assinado (HMAC, recvWindow, relógio sincronizado).
import crypto from "node:crypto";
import fetch from "node-fetch";
import { BASE_URL, getApiKey, getApiSecret, hasCredentials } from "../config.js";

// ---- Limite de peso da Binance (6000 por minuto, por IP) ----
// Cada resposta informa o peso já usado no minuto (X-MBX-USED-WEIGHT-1M). Perto do limite, as
// próximas requisições esperam o minuto virar em vez de estourar; em 429/418 respeita o Retry-After.
const WEIGHT_SAFE = 5000;
let usedWeight = 0;
let weightMinute = 0;
let pauseUntil = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const currentMinute = () => Math.floor(Date.now() / 60000);

async function throttle() {
	while (true) {
		const now = Date.now();
		if (pauseUntil > now) {
			await sleep(pauseUntil - now);
			continue;
		}
		if (currentMinute() !== weightMinute) {
			weightMinute = currentMinute();
			usedWeight = 0;
		}
		if (usedWeight < WEIGHT_SAFE) return;
		await sleep((weightMinute + 1) * 60000 - now + 250);
	}
}

// fetch que anota o peso usado e, se a Binance pedir para esperar, pausa as próximas requisições
async function trackedFetch(url, options) {
	const res = await fetch(url, options);
	const weight = Number(res.headers.get("x-mbx-used-weight-1m"));
	if (weight > 0) {
		weightMinute = currentMinute();
		usedWeight = weight;
	}
	if (res.status === 429 || res.status === 418) {
		const retryAfter = Number(res.headers.get("retry-after")) || 60;
		pauseUntil = Math.max(pauseUntil, Date.now() + retryAfter * 1000);
	}
	return res;
}

// GET público (sem assinatura): `pathAndQuery` como "/api/v3/ticker/price"
export async function publicGet(pathAndQuery, retried = false) {
	await throttle();
	const res = await trackedFetch(`${BASE_URL}${pathAndQuery}`);
	if (res.status === 429 && !retried) return publicGet(pathAndQuery, true); // espera o Retry-After e tenta de novo
	if (!res.ok) throw new Error(await res.text());
	return res.json();
}

function signQuery(query, secret) {
	return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

// erro "sem chave": as rotas respondem 401 e o dashboard abre as Configurações
export class MissingCredentialsError extends Error {
	constructor() {
		super("Chaves da API da Binance não configuradas. Abra Configurações no dashboard.");
		this.status = 401;
		this.code = "API_KEY_MISSING";
	}
}

// ---- Sincronização de relógio (evita erro -1021 "Timestamp outside of recvWindow") ----
const RECV_WINDOW_MS = 10000;
const TIME_SYNC_INTERVAL_MS = 30 * 60 * 1000;
let serverTimeOffset = 0;

async function syncServerTime() {
	const sentAt = Date.now();
	const { serverTime } = await publicGet("/api/v3/time");
	const receivedAt = Date.now();
	// compensa metade da latência da ida e volta
	serverTimeOffset = serverTime - Math.round((sentAt + receivedAt) / 2);
}

syncServerTime().catch((err) =>
	console.warn("Aviso: não foi possível sincronizar o relógio com a Binance:", err.message)
);
setInterval(() => syncServerTime().catch(() => {}), TIME_SYNC_INTERVAL_MS).unref();

// GET assinado com as chaves configuradas
export function signedGet(pathname, params = {}) {
	if (!hasCredentials()) return Promise.reject(new MissingCredentialsError());
	return signedGetWith({ key: getApiKey(), secret: getApiSecret() }, pathname, params);
}

// GET assinado com chaves informadas (usado também para testar chaves novas antes de salvar);
// recvWindow e timestamp corrigido; em -1021 ressincroniza e tenta de novo
export async function signedGetWith(creds, pathname, params = {}, retried = false) {
	await throttle(); // antes de montar o timestamp (a espera não pode vencer o recvWindow)
	const query = new URLSearchParams({
		...params,
		recvWindow: RECV_WINDOW_MS,
		timestamp: Date.now() + serverTimeOffset,
	}).toString();
	const signature = signQuery(query, creds.secret);

	const res = await trackedFetch(`${BASE_URL}${pathname}?${query}&signature=${signature}`, {
		headers: { "X-MBX-APIKEY": creds.key },
	});

	if (!res.ok) {
		if (res.status === 429 && !retried) return signedGetWith(creds, pathname, params, true); // espera o Retry-After
		const text = await res.text();
		if (!retried && text.includes("-1021")) {
			await syncServerTime();
			return signedGetWith(creds, pathname, params, true);
		}
		const err = new Error(text);
		err.status = res.status;
		throw err;
	}
	return res.json();
}

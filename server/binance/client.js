// Cliente HTTP da Binance: GET público e GET assinado (HMAC, recvWindow, relógio sincronizado).
import crypto from "node:crypto";
import fetch from "node-fetch";
import { BASE_URL, BINANCE_API_KEY, BINANCE_API_SECRET } from "../config.js";

// GET público (sem assinatura): `pathAndQuery` como "/api/v3/ticker/price"
export async function publicGet(pathAndQuery) {
	const res = await fetch(`${BASE_URL}${pathAndQuery}`);
	if (!res.ok) throw new Error(await res.text());
	return res.json();
}

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
	const { serverTime } = await publicGet("/api/v3/time");
	const receivedAt = Date.now();
	// compensa metade da latência da ida e volta
	serverTimeOffset = serverTime - Math.round((sentAt + receivedAt) / 2);
}

syncServerTime().catch((err) =>
	console.warn("Aviso: não foi possível sincronizar o relógio com a Binance:", err.message)
);
setInterval(() => syncServerTime().catch(() => {}), TIME_SYNC_INTERVAL_MS).unref();

// GET assinado com recvWindow e timestamp corrigido; em -1021 ressincroniza e tenta de novo
export async function signedGet(pathname, params = {}, retried = false) {
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

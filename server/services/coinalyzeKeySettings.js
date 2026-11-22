// Chave da Coinalyze pelo dashboard (painel Configurações): status (só o final da chave), troca
// (testa na Coinalyze, passa a usar na hora e grava no .env) e remoção.
import { COINALYZE_KEY_PATTERN, getCoinalyzeKey, saveCoinalyzeKeyToEnv, setCoinalyzeKey } from "../config.js";
import { coinalyzeGet } from "../coinalyze/client.js";
import { clearCache } from "../lib/cache.js";

const hintOf = (key) => (key ? `…${key.slice(-4)}` : null);

export function coinalyzeKeyStatus() {
	const key = getCoinalyzeKey();
	return { configured: Boolean(key), keyHint: hintOf(key) };
}

function invalid(message) {
	const err = new Error(message);
	err.status = 400;
	return err;
}

/** Testa e passa a usar a chave (vazia = remove). Devolve { status, persist() } — persist() grava no .env */
export async function changeCoinalyzeKey(body) {
	const key = String(body?.apiKey ?? "").trim();
	if (key) {
		if (!COINALYZE_KEY_PATTERN.test(key)) throw invalid("Chave inválida: deve ter só letras, números e hífens.");
		try {
			await coinalyzeGet("/exchanges", {}, key);
		} catch (err) {
			throw invalid(
				err.code === "COINALYZE_KEY_INVALID"
					? "A Coinalyze recusou a chave: confira se copiou a chave inteira."
					: `Não foi possível testar a chave na Coinalyze: ${err.message}`
			);
		}
	}
	setCoinalyzeKey(key);
	clearCache(); // dados de liquidação guardados eram da chave anterior (ou da falta dela)
	return { status: coinalyzeKeyStatus(), persist: () => saveCoinalyzeKeyToEnv(key) };
}

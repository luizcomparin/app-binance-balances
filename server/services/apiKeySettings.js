// Chaves da API da Binance pelo dashboard (painel Configurações):
//   - status: se há chave configurada (só o final da chave; o secret nunca sai do servidor);
//   - troca: testa as chaves novas na Binance, avisa se têm permissões além de leitura,
//     passa a usá-las na hora e grava no .env.
import { CREDENTIAL_PATTERN, getApiKey, hasCredentials, saveCredentialsToEnv, setCredentials } from "../config.js";
import { signedGetWith } from "../binance/client.js";
import { clearTradesCache } from "../binance/account.js";
import { clearCache } from "../lib/cache.js";

const hintOf = (key) => (key ? `…${key.slice(-4)}` : null);

export function apiKeyStatus() {
	return { configured: hasCredentials(), keyHint: hintOf(getApiKey()) };
}

// erro de validação: a rota responde 400 com a mensagem
function invalid(message) {
	const err = new Error(message);
	err.status = 400;
	return err;
}

// mensagem amigável para os erros mais comuns da Binance ao testar a chave
function binanceErrorMessage(err) {
	const text = String(err.message || "");
	if (text.includes("-2015") || text.includes("-2014") || text.includes("-1022")) {
		return "A Binance recusou a chave: confira a API Key e a Secret Key, se a permissão de leitura está ativa e, se a chave tiver restrição de IP, se o seu IP está liberado.";
	}
	return `Não foi possível testar a chave na Binance: ${text}`;
}

/** Testa e passa a usar as chaves. Devolve { status, warnings, persist() } — persist() grava no .env */
export async function changeApiKey(body) {
	const apiKey = String(body?.apiKey ?? "").trim();
	const apiSecret = String(body?.apiSecret ?? "").trim();
	if (!CREDENTIAL_PATTERN.test(apiKey)) throw invalid("API Key inválida: deve ter só letras e números.");
	if (!CREDENTIAL_PATTERN.test(apiSecret)) throw invalid("Secret Key inválida: deve ter só letras e números.");

	const creds = { key: apiKey, secret: apiSecret };
	try {
		await signedGetWith(creds, "/api/v3/account", { omitZeroBalances: true });
	} catch (err) {
		throw invalid(binanceErrorMessage(err));
	}

	// o dashboard só lê: avisa se a chave pode negociar ou sacar (melhor criar uma só de leitura)
	const warnings = [];
	try {
		const r = await signedGetWith(creds, "/sapi/v1/account/apiRestrictions");
		if (r.enableWithdrawals) warnings.push("Esta chave pode fazer SAQUES. O dashboard só precisa de leitura: recomendo criar outra só com \"Habilitar leitura\".");
		if (r.enableSpotAndMarginTrading || r.enableFutures || r.enableMargin) {
			warnings.push("Esta chave pode NEGOCIAR (spot/margem/futuros). O dashboard só precisa de leitura.");
		}
	} catch {
		// sem acesso ao endpoint de restrições: segue sem o aviso
	}

	setCredentials(apiKey, apiSecret);
	clearCache(); // dados guardados eram da chave anterior
	clearTradesCache();

	return { status: apiKeyStatus(), warnings, persist: () => saveCredentialsToEnv(apiKey, apiSecret) };
}

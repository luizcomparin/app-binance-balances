// Configuração lida do .env. Este módulo é importado primeiro pelo server.js,
// então o .env já está carregado quando os outros módulos usam as chaves.
import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(".env"); // o mesmo arquivo que process.loadEnvFile() lê (pasta atual)

process.loadEnvFile();

export const PORT = Number(process.env.PORT);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
	console.error("Erro: defina PORT no .env com uma porta entre 1 e 65535");
	process.exit(1);
}

// ---- Chaves da API da Binance ----
// Podem faltar (o painel de Configurações do dashboard pede) e mudar sem reiniciar o servidor.
const credentials = {
	key: process.env.BINANCE_API_KEY || "",
	secret: process.env.BINANCE_API_SECRET || "",
};

export const getApiKey = () => credentials.key;
export const getApiSecret = () => credentials.secret;
export const hasCredentials = () => Boolean(credentials.key && credentials.secret);

if (!hasCredentials()) {
	console.warn("Aviso: chaves da API da Binance não configuradas. Informe-as no dashboard (Configurações).");
}

// chave/secret da Binance: só letras e números (também impede quebrar linhas do .env)
export const CREDENTIAL_PATTERN = /^[A-Za-z0-9]{16,128}$/;

// Troca as chaves em memória (vale na hora) e grava no .env (vale ao reiniciar)
export function setCredentials(key, secret) {
	credentials.key = key;
	credentials.secret = secret;
	process.env.BINANCE_API_KEY = key;
	process.env.BINANCE_API_SECRET = secret;
}

// Grava/atualiza as linhas no .env mantendo o resto do arquivo como está
export function saveCredentialsToEnv(key, secret) {
	let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	for (const [name, value] of [
		["BINANCE_API_KEY", key],
		["BINANCE_API_SECRET", secret],
	]) {
		const line = `${name}=${value}`;
		const re = new RegExp(`^${name}=.*$`, "m");
		if (re.test(text)) text = text.replace(re, () => line);
		else text += (text && !text.endsWith("\n") ? eol : "") + line + eol;
	}
	fs.writeFileSync(ENV_PATH, text);
}

export const BASE_URL = "https://api.binance.com";

export const DAY_MS = 24 * 60 * 60 * 1000;

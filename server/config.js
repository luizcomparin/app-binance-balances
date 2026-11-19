// Configuração lida do .env. Este módulo é importado primeiro pelo server.js,
// então o .env já está carregado quando os outros módulos usam as chaves.

process.loadEnvFile();

export const PORT = Number(process.env.PORT);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
	console.error("Erro: defina PORT no .env com uma porta entre 1 e 65535");
	process.exit(1);
}

export const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
export const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;

if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
	console.error("Erro: defina BINANCE_API_KEY e BINANCE_API_SECRET no .env");
	process.exit(1);
}

export const BASE_URL = "https://api.binance.com";

export const DAY_MS = 24 * 60 * 60 * 1000;

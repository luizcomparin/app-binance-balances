// server.js

process.loadEnvFile();
import express from "express";
import crypto from "node:crypto";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
const PORT = 3000;

const { BINANCE_API_KEY, BINANCE_API_SECRET } = process.env;
const BASE_URL = "https://api.binance.com";

if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
	console.error("Erro: defina BINANCE_API_KEY e BINANCE_API_SECRET no .env");
	process.exit(1);
}

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function signQuery(query) {
	return crypto
		.createHmac("sha256", BINANCE_API_SECRET)
		.update(query)
		.digest("hex");
}

// Retorna dados crus da Binance (inclui balances, permissões, etc.)
async function getRawBinanceAccount() {
	const timestamp = Date.now();
	const query = `timestamp=${timestamp}`;
	const signature = signQuery(query);

	const url = `${BASE_URL}/api/v3/account?${query}&signature=${signature}`;
	const res = await fetch(url, {
		headers: { "X-MBX-APIKEY": BINANCE_API_KEY },
	});

	if (!res.ok) throw new Error(await res.text());

	return await res.json();
}

// Saldo da conta (para /balances)
async function getAccountBalances() {
	const data = await getRawBinanceAccount();
	return data.balances;
}

// Busca TODAS as cotações
async function getAllPrices() {
	const res = await fetch(`${BASE_URL}/api/v3/ticker/price`);
	if (!res.ok) throw new Error(await res.text());

	const list = await res.json();
	const priceMap = {};
	for (const item of list) {
		priceMap[item.symbol] = Number(item.price);
	}
	return priceMap;
}

function sortByPercentage(rows) {
	return rows.sort((a, b) => b.pct - a.pct);
}

// Monta dados refinados (rota /balances)
async function buildWalletData() {
	const balances = await getAccountBalances();

	const nonZero = balances.filter(
		(b) => Number(b.free) > 0 || Number(b.locked) > 0
	);

	const allPrices = await getAllPrices();

	const rows = [];

	for (const b of nonZero) {
		const asset = b.asset;

		let price = 1;
		if (asset !== "USDT" && asset !== "BUSD") {
			price = allPrices[asset + "USDT"] || null;
		}

		if (price === null) continue;

		const free = Number(b.free);
		const locked = Number(b.locked);

		const freeUSDT = free * price;
		const lockedUSDT = locked * price;
		const totalUSDT = freeUSDT + lockedUSDT;

		rows.push({
			asset,
			freeUSDT,
			lockedUSDT,
			totalUSDT,
		});
	}

	const totalWalletUSDT = rows.reduce((acc, r) => acc + r.totalUSDT, 0);

	const processed = rows.map((r) => ({
		...r,
		pct: (r.totalUSDT / totalWalletUSDT) * 100,
	}));

	return {
		total_usdt: totalWalletUSDT,
		assets: sortByPercentage(processed),
	};
}

async function getOpenOrders() {
	const timestamp = Date.now();
	const query = `timestamp=${timestamp}`;
	const signature = signQuery(query);

	const url = `${BASE_URL}/api/v3/openOrders?${query}&signature=${signature}`;

	const res = await fetch(url, {
		headers: { "X-MBX-APIKEY": BINANCE_API_KEY },
	});

	if (!res.ok) throw new Error(await res.text());
	return await res.json();
}

function groupOrdersByAsset(orders) {
	const map = {};

	for (const order of orders) {
		// extrai ativo base — assume pares padrão tipo BTCUSDT, ETHBTC, etc
		const asset = order.symbol.replace(
			/USDT|BTC|ETH|BNB|BUSD|FDUSD|TRY$/,
			""
		);

		if (!map[asset]) map[asset] = [];
		map[asset].push(order);
	}

	return map;
}

// -----------------------------------------------------------------------------
// ROTAS
// -----------------------------------------------------------------------------

// 🔥 NOVO: retorna o JSON cru da Binance
app.get("/raw", async (req, res) => {
	try {
		const data = await getRawBinanceAccount();
		res.json(data);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

// Rota refinada com cálculos
app.get("/balances", async (req, res) => {
	try {
		const data = await buildWalletData();
		res.json(data);
	} catch (err) {
		res.status(500).json({ error: err.toString() });
	}
});

app.get("/orders", async (req, res) => {
	try {
		const orders = await getOpenOrders();
		const grouped = groupOrdersByAsset(orders);
		res.json(grouped);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

app.get("/orders/:asset", async (req, res) => {
	try {
		const asset = req.params.asset.toUpperCase();

		const orders = await getOpenOrders();
		const grouped = groupOrdersByAsset(orders);

		res.json(grouped[asset] || []);
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
});

app.listen(PORT, () => {
	console.log(`🚀 API rodando em:
   • http://localhost:${PORT}/balances   (carteira filtrada)
   • http://localhost:${PORT}/raw        (dados crus da Binance)
   • http://localhost:${PORT}/orders     (ordens abertas agrupadas por ativo)
   • http://localhost:${PORT}/orders/:asset     (ordens abertas para ativo específico)
  `);
});

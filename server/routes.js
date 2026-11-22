// Rotas da API. Cada handler só valida a entrada e chama o serviço correspondente.
import { getRawBinanceAccount } from "./binance/account.js";
import { buildWalletData } from "./services/wallet.js";
import { buildPositions } from "./services/positions.js";
import { buildOpenOrders, groupOrdersByAsset } from "./services/openOrders.js";
import { buildExecutedOrders } from "./services/executedOrders.js";
import { buildPriceChart, CHART_INTERVALS } from "./services/priceChart.js";
import { buildOrderHistory } from "./services/orderHistory.js";
import { buildAssetTrades } from "./services/assetTrades.js";
import { buildLiquidationMap } from "./services/liquidationMap.js";
import { buildFuturesData, FUTURES_PERIODS } from "./services/futuresData.js";
import { apiKeyStatus, changeApiKey } from "./services/apiKeySettings.js";
import { buildLiquidations, LIQUIDATION_INTERVALS } from "./services/liquidations.js";
import { changeCoinalyzeKey, coinalyzeKeyStatus } from "./services/coinalyzeKeySettings.js";
import { PORT } from "./config.js";
import express from "express";

// Envolve o handler: responde o JSON retornado ou { error } com status 500;
// sem chave da API: 401 com code "API_KEY_MISSING" (o dashboard abre as Configurações)
const handle = (fn) => async (req, res) => {
	try {
		res.json(await fn(req, res));
	} catch (e) {
		res.status(e.code === "API_KEY_MISSING" ? 401 : 500).json({ error: e.toString(), code: e.code });
	}
};

// Só o próprio dashboard pode trocar a chave: Origin (quando vem) tem de ser o dashboard e o corpo
// tem de ser JSON (o navegador exige pré-checagem de CORS, então outro site não consegue enviar)
function sameOriginJson(req, res, next) {
	const origin = req.get("origin");
	const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
	if ((origin && !allowed.includes(origin)) || !req.is("application/json")) {
		return res.status(403).json({ error: "Requisição não permitida" });
	}
	next();
}

export function registerRoutes(app) {
	// Chave da API da Binance (painel Configurações): status e troca (o secret nunca é devolvido)
	app.get("/settings/api-key", (req, res) => res.json(apiKeyStatus()));
	app.post("/settings/api-key", sameOriginJson, express.json({ limit: "2kb" }), async (req, res) => {
		try {
			const { status, warnings, persist } = await changeApiKey(req.body);
			// grava no .env depois de responder (em modo dev o nodemon reinicia ao ver o .env mudar)
			res.on("finish", () => {
				try {
					persist();
				} catch (err) {
					console.error("Erro ao gravar as chaves no .env:", err.message);
				}
			});
			res.json({ ...status, warnings });
		} catch (e) {
			res.status(e.status === 400 ? 400 : 500).json({ error: e.message });
		}
	});

	// Chave da Coinalyze (opcional, liquidações reais no gráfico): status e troca (vazia = remove)
	app.get("/settings/coinalyze-key", (req, res) => res.json(coinalyzeKeyStatus()));
	app.post("/settings/coinalyze-key", sameOriginJson, express.json({ limit: "2kb" }), async (req, res) => {
		try {
			const { status, persist } = await changeCoinalyzeKey(req.body);
			res.on("finish", () => {
				try {
					persist();
				} catch (err) {
					console.error("Erro ao gravar a chave da Coinalyze no .env:", err.message);
				}
			});
			res.json(status);
		} catch (e) {
			res.status(e.status === 400 ? 400 : 500).json({ error: e.message });
		}
	});

	// JSON cru da conta na Binance
	app.get("/raw", handle(() => getRawBinanceAccount()));

	// Carteira com valores em USDT, participação e variação de 24h
	app.get("/balances", handle(() => buildWalletData()));

	// Preço médio, custo e P&L (realizado e não realizado) por moeda
	app.get("/positions", handle(() => buildPositions()));

	// Compat: mapa asset -> preço médio de compra (USDT)
	app.get(
		"/avg-buy-prices",
		handle(async () => {
			const { positions } = await buildPositions();
			const map = {};
			for (const p of Object.values(positions)) map[p.asset] = p.avgBuyPriceUSDT;
			return map;
		})
	);

	// Ordens abertas agrupadas por moeda
	app.get("/orders", handle(async () => groupOrdersByAsset(await buildOpenOrders())));

	// Ordens abertas de uma moeda
	app.get(
		"/orders/:asset",
		handle(async (req) => {
			const asset = req.params.asset.toUpperCase();
			const grouped = groupOrdersByAsset(await buildOpenOrders());
			return grouped[asset] || [];
		})
	);

	// Histórico de ordens de uma moeda (executadas, canceladas, expiradas), com as execuções de cada uma
	app.get("/order-history/:asset", (req, res, next) => {
		const asset = String(req.params.asset).toUpperCase();
		if (!/^[A-Z0-9]{1,20}$/.test(asset)) {
			return res.status(400).json({ error: "Moeda inválida" });
		}
		return handle(() => buildOrderHistory(asset))(req, res, next);
	});

	// Histórico de trades (execuções) de uma moeda, com taxa, maker/taker e total em USDT
	app.get("/trade-history/:asset", (req, res, next) => {
		const asset = String(req.params.asset).toUpperCase();
		if (!/^[A-Z0-9]{1,20}$/.test(asset)) return res.status(400).json({ error: "Moeda inválida" });
		return handle(() => buildAssetTrades(asset))(req, res, next);
	});

	// Mapa de liquidação estimado de uma moeda (futuros perpétuos: open interest + long/short, 30 dias)
	app.get("/liquidation-map/:asset", (req, res, next) => {
		const asset = String(req.params.asset).toUpperCase();
		if (!/^[A-Z0-9]{1,20}$/.test(asset)) {
			return res.status(400).json({ error: "Moeda inválida" });
		}
		return handle(() => buildLiquidationMap(asset))(req, res, next);
	});

	// Dados de futuros de uma moeda: open interest, long/short e funding (?period=1h|4h|1d)
	app.get("/futures-data/:asset", (req, res, next) => {
		const asset = String(req.params.asset).toUpperCase();
		const period = String(req.query.period || "1d");
		if (!/^[A-Z0-9]{1,20}$/.test(asset)) return res.status(400).json({ error: "Moeda inválida" });
		if (!FUTURES_PERIODS.has(period)) return res.status(400).json({ error: "Período inválido" });
		return handle(() => buildFuturesData(asset, period))(req, res, next);
	});

	// Liquidações reais (Binance + Bybit + OKX, via Coinalyze) por período (?interval=1h|4h|1d|1w|1M)
	app.get("/liquidations/:asset", (req, res, next) => {
		const asset = String(req.params.asset).toUpperCase();
		const interval = String(req.query.interval || "1d");
		if (!/^[A-Z0-9]{1,20}$/.test(asset)) return res.status(400).json({ error: "Moeda inválida" });
		if (!LIQUIDATION_INTERVALS.has(interval)) return res.status(400).json({ error: "Intervalo inválido" });
		return handle(() => buildLiquidations(asset, interval))(req, res, next);
	});

	// Ordens executadas (agrupadas a partir dos trades)
	app.get("/executed-orders", handle(() => buildExecutedOrders()));

	// Série de preços de uma moeda em USDT.
	//   ?interval=1h|4h|1d|1w|1M [&limit=1..1000] [&before=ms]  → velas desse tamanho (usado pelo gráfico)
	//   ?range=7d|30d|90d|1y|all ou <n>d|<n>m|<n>y [&before=ms] → tamanho escolhido pelo período (compat.)
	app.get("/price-chart/:asset", (req, res, next) => {
		const asset = String(req.params.asset).toUpperCase();
		if (!/^[A-Z0-9]{1,20}$/.test(asset)) {
			return res.status(400).json({ error: "Moeda inválida" });
		}
		const interval = req.query.interval ? String(req.query.interval) : null;
		if (interval && !CHART_INTERVALS.has(interval)) {
			return res.status(400).json({ error: "Intervalo inválido" });
		}
		const before = Number(req.query.before);
		const limit = Number(req.query.limit);

		return handle(() =>
			buildPriceChart(asset, {
				range: String(req.query.range || "30d"),
				interval,
				limit: Number.isInteger(limit) ? Math.min(1000, Math.max(1, limit)) : null,
				before: Number.isFinite(before) && before > 0 ? before : null,
			})
		)(req, res, next);
	});
}

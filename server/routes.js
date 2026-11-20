// Rotas da API. Cada handler só valida a entrada e chama o serviço correspondente.
import { getRawBinanceAccount } from "./binance/account.js";
import { buildWalletData } from "./services/wallet.js";
import { buildPositions } from "./services/positions.js";
import { buildOpenOrders, groupOrdersByAsset } from "./services/openOrders.js";
import { buildExecutedOrders } from "./services/executedOrders.js";
import { buildPriceChart, CHART_INTERVALS } from "./services/priceChart.js";
import { buildOrderHistory } from "./services/orderHistory.js";

// Envolve o handler: responde o JSON retornado ou { error } com status 500
const handle = (fn) => async (req, res) => {
	try {
		res.json(await fn(req, res));
	} catch (e) {
		res.status(500).json({ error: e.toString() });
	}
};

export function registerRoutes(app) {
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

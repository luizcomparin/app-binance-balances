// Histórico de ordens de uma moeda (rota /order-history/:asset), como a aba "Order History" da Binance:
// ordens encerradas (executadas, canceladas, expiradas...) de todos os pares da moeda,
// cada uma com as execuções (trades) que a compõem.
import { getAllMyTrades, getAllOrders } from "../binance/account.js";
import { getSymbolInfo } from "../binance/market.js";
import { mapLimit } from "../lib/cache.js";
import { PNL_QUOTES } from "./tradeHistory.js";

// ainda em aberto: aparecem em "Ordens abertas", não no histórico
const OPEN_STATUSES = new Set(["NEW", "PARTIALLY_FILLED", "PENDING_NEW"]);

export async function buildOrderHistory(asset) {
	const symbolInfo = await getSymbolInfo();
	const symbols = Object.entries(symbolInfo)
		.filter(([, info]) => info.baseAsset === asset && PNL_QUOTES.includes(info.quoteAsset))
		.map(([symbol]) => symbol);

	const orders = [];
	const errors = [];
	await mapLimit(symbols, 4, async (symbol) => {
		try {
			const [list, trades] = await Promise.all([getAllOrders(symbol), getAllMyTrades(symbol)]);
			if (!list.length) return;

			const fillsByOrder = new Map();
			for (const t of trades) {
				if (!fillsByOrder.has(t.orderId)) fillsByOrder.set(t.orderId, []);
				fillsByOrder.get(t.orderId).push({
					time: t.time,
					price: Number(t.price),
					qty: Number(t.qty),
					quoteQty: Number(t.quoteQty),
					commission: Number(t.commission),
					commissionAsset: t.commissionAsset,
					isMaker: t.isMaker,
				});
			}

			const { quoteAsset } = symbolInfo[symbol];
			for (const o of list) {
				if (OPEN_STATUSES.has(o.status)) continue;
				const executedQty = Number(o.executedQty);
				const quoteQty = Number(o.cummulativeQuoteQty);
				orders.push({
					symbol,
					baseAsset: asset,
					quoteAsset,
					orderId: o.orderId,
					orderListId: o.orderListId,
					time: o.time,
					updateTime: o.updateTime,
					type: o.type,
					side: o.side,
					status: o.status,
					price: Number(o.price),
					stopPrice: Number(o.stopPrice),
					origQty: Number(o.origQty),
					icebergQty: Number(o.icebergQty),
					executedQty,
					quoteQty,
					avgPrice: executedQty ? quoteQty / executedQty : null,
					fills: (fillsByOrder.get(o.orderId) || []).sort((a, b) => a.time - b.time),
				});
			}
		} catch (err) {
			if (err.status === 429 || err.status === 418) throw err;
			errors.push({ symbol, error: err.message });
		}
	});

	orders.sort((a, b) => b.time - a.time);
	return { asset, orders, errors, generatedAt: Date.now() };
}

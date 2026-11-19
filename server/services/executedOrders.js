// Ordens executadas (rota /executed-orders): trades (fills) agrupados por ordem.
// Usa o mesmo histórico do P&L, então cobre as moedas que estão em carteira hoje
// (moedas já zeradas não aparecem).
import { resolveSymbol } from "../binance/market.js";
import { loadTradeHistory, rateToUSDTAt } from "./tradeHistory.js";

export async function buildExecutedOrders() {
	const { prices, symbolInfo, tradesByAsset, errors } = await loadTradeHistory();

	const byOrder = new Map();
	for (const trades of Object.values(tradesByAsset)) {
		for (const t of trades) {
			const key = `${t.symbol}:${t.orderId}`;
			let order = byOrder.get(key);
			if (!order) {
				const { baseAsset, quoteAsset } = resolveSymbol(t.symbol, symbolInfo);
				order = {
					symbol: t.symbol,
					orderId: t.orderId,
					baseAsset,
					quoteAsset,
					side: t.isBuyer ? "BUY" : "SELL",
					qty: 0,
					quoteQty: 0,
					totalUSDT: 0,
					fees: {},
					feeUSDT: 0,
					fills: 0,
					time: t.time,
				};
				byOrder.set(key, order);
			}

			const quoteRate = rateToUSDTAt(order.quoteAsset, t.time, prices);
			const commission = Number(t.commission || 0);

			order.qty += Number(t.qty);
			order.quoteQty += Number(t.quoteQty);
			order.totalUSDT += Number(t.quoteQty) * quoteRate;
			order.fees[t.commissionAsset] = (order.fees[t.commissionAsset] || 0) + commission;
			// taxa paga na própria moeda é convertida pelo preço do fill
			order.feeUSDT +=
				t.commissionAsset === order.baseAsset
					? commission * Number(t.price) * quoteRate
					: commission * rateToUSDTAt(t.commissionAsset, t.time, prices);
			order.fills += 1;
			order.time = Math.max(order.time, t.time);
		}
	}

	const orders = [...byOrder.values()]
		.map((o) => ({ ...o, avgPrice: o.qty ? o.quoteQty / o.qty : 0 }))
		.sort((a, b) => b.time - a.time);

	return { orders, errors, generatedAt: Date.now() };
}

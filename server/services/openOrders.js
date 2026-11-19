// Ordens abertas (rotas /orders e /orders/:asset): base/quote resolvidos, totais em USDT e distância até executar.
import { getOpenOrders } from "../binance/account.js";
import { getAllPrices, getPriceInUSDT, getSymbolInfo, resolveSymbol } from "../binance/market.js";

export async function buildOpenOrders() {
	const [orders, prices, symbolInfo] = await Promise.all([
		getOpenOrders(),
		getAllPrices(),
		getSymbolInfo().catch(() => null),
	]);

	return orders.map((order) => {
		const { baseAsset, quoteAsset } = resolveSymbol(order.symbol, symbolInfo);

		// ordens STOP_LOSS/TAKE_PROFIT (a mercado) têm price = 0; usa o stopPrice
		const price = Number(order.price) || Number(order.stopPrice) || 0;
		// em ordens parcialmente executadas, só o restante continua em aberto
		const remainingQty = Number(order.origQty) - Number(order.executedQty || 0);
		const totalQuote = price * remainingQty;

		const quotePriceUSDT = quoteAsset
			? getPriceInUSDT(quoteAsset, prices)
			: null;

		// preço atual do par e quanto falta (em %) para a ordem executar
		const currentPrice = prices[order.symbol] || null;
		const distancePct = currentPrice ? ((price - currentPrice) / currentPrice) * 100 : null;
		// valor atual de mercado da quantidade em aberto (base a preço de agora), em USDT
		const marketValueUSDT =
			currentPrice && quotePriceUSDT !== null
				? remainingQty * currentPrice * quotePriceUSDT
				: null;

		return {
			...order,
			baseAsset,
			quoteAsset,
			remainingQty,
			totalQuote,
			quotePriceUSDT,
			totalUSDT: quotePriceUSDT !== null ? totalQuote * quotePriceUSDT : null,
			currentPrice,
			distancePct,
			marketValueUSDT,
		};
	});
}

export function groupOrdersByAsset(orders) {
	const map = {};

	for (const order of orders) {
		const asset = order.baseAsset;

		if (!map[asset]) map[asset] = [];
		map[asset].push(order);
	}

	return map;
}

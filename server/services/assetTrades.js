// Histórico de trades de uma moeda (rota /trade-history/:asset), como a aba "Trade History" da Binance:
// cada execução (fill) em todos os pares da moeda, com taxa, função (maker/taker) e total em USDT.
// Usa o mesmo cache incremental de trades do P&L, então quase não gasta peso da API.
import { getAllMyTrades } from "../binance/account.js";
import { getAllPrices, getSymbolInfo } from "../binance/market.js";
import { cached, mapLimit } from "../lib/cache.js";
import { PNL_QUOTES, rateToUSDTAt } from "./tradeHistory.js";

const CACHE_MS = 30 * 1000;

export function buildAssetTrades(asset) {
	return cached(`assetTrades:${asset}`, CACHE_MS, () => computeAssetTrades(asset));
}

async function computeAssetTrades(asset) {
	const [symbolInfo, prices] = await Promise.all([getSymbolInfo(), getAllPrices()]);
	const symbols = Object.entries(symbolInfo)
		.filter(([, info]) => info.baseAsset === asset && PNL_QUOTES.includes(info.quoteAsset))
		.map(([symbol]) => symbol);

	const trades = [];
	const errors = [];
	await mapLimit(symbols, 4, async (symbol) => {
		try {
			const list = await getAllMyTrades(symbol, { tradable: symbolInfo[symbol]?.status === "TRADING" });
			const { quoteAsset } = symbolInfo[symbol];
			for (const t of list) {
				const quoteQty = Number(t.quoteQty);
				// cotação da moeda de cotação no dia do trade (BRL, BTC...); USDT/estáveis = 1
				const rate = rateToUSDTAt(quoteAsset, t.time, prices);
				trades.push({
					id: t.id,
					orderId: t.orderId,
					symbol,
					baseAsset: asset,
					quoteAsset,
					time: t.time,
					side: t.isBuyer ? "BUY" : "SELL",
					price: Number(t.price),
					qty: Number(t.qty),
					quoteQty,
					totalUSDT: rate ? quoteQty * rate : null,
					commission: Number(t.commission),
					commissionAsset: t.commissionAsset,
					isMaker: t.isMaker,
				});
			}
		} catch (err) {
			if (err.status === 429 || err.status === 418) throw err;
			errors.push({ symbol, error: err.message });
		}
	});

	trades.sort((a, b) => b.time - a.time);
	return { asset, trades, errors, generatedAt: Date.now() };
}

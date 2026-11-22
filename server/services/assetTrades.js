// Histórico de trades de uma moeda (rota /trade-history/:asset), como a aba "Trade History" da Binance:
// cada execução (fill) em todos os pares da moeda, com taxa, função (maker/taker) e total em USDT.
// Usa o mesmo cache incremental de trades do P&L, então quase não gasta peso da API.
import { getAllMyTrades } from "../binance/account.js";
import { getAllPrices, getSymbolInfo } from "../binance/market.js";
import { cached, mapLimit } from "../lib/cache.js";
import { loadRatesForTrades, PNL_QUOTES, rateToUSDTAt } from "./tradeHistory.js";

const CACHE_MS = 30 * 1000;

export function buildAssetTrades(asset) {
	return cached(`assetTrades:${asset}`, CACHE_MS, () => computeAssetTrades(asset));
}

async function computeAssetTrades(asset) {
	const [symbolInfo, prices] = await Promise.all([getSymbolInfo(), getAllPrices()]);
	const symbols = Object.entries(symbolInfo)
		.filter(([, info]) => info.baseAsset === asset && PNL_QUOTES.includes(info.quoteAsset))
		.map(([symbol]) => symbol);

	const raw = [];
	const errors = [];
	await mapLimit(symbols, 4, async (symbol) => {
		try {
			raw.push(...(await getAllMyTrades(symbol, { tradable: symbolInfo[symbol]?.status === "TRADING" })));
		} catch (err) {
			if (err.status === 429 || err.status === 418) throw err;
			errors.push({ symbol, error: err.message });
		}
	});

	// cotações diárias das moedas de cotação (BRL, BTC...) antes de converter: sem isso, se o P&L ainda não
	// tivesse carregado o histórico delas, os trades seriam convertidos pela cotação de hoje
	await loadRatesForTrades(raw, symbolInfo, prices, errors);

	const trades = raw.map((t) => {
		const { quoteAsset } = symbolInfo[t.symbol];
		const quoteQty = Number(t.quoteQty);
		// cotação da moeda de cotação no dia do trade; USDT/estáveis = 1
		const rate = rateToUSDTAt(quoteAsset, t.time, prices);
		return {
			id: t.id,
			orderId: t.orderId,
			symbol: t.symbol,
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
		};
	});

	trades.sort((a, b) => b.time - a.time);
	return { asset, trades, errors, generatedAt: Date.now() };
}

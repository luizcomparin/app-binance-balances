// Posições / P&L (rotas /positions e /avg-buy-prices): preço médio, custo, P&L realizado e não realizado.
import { getPriceInUSDT, resolveSymbol } from "../binance/market.js";
import { loadTradeHistory, rateToUSDTAt } from "./tradeHistory.js";
import { computePosition } from "./positionMath.js";

export async function buildPositions() {
	const { holdings, prices, symbolInfo, tradesByAsset, errors } = await loadTradeHistory();

	const positions = {};
	for (const h of holdings) {
		const trades = [...(tradesByAsset[h.asset] || [])].sort(
			(a, b) => a.time - b.time || a.id - b.id
		);
		const currentPrice = getPriceInUSDT(h.asset, prices);
		const pos = computePosition(h.asset, trades, {
			quoteAssetOf: (symbol) => resolveSymbol(symbol, symbolInfo).quoteAsset,
			rateAt: (asset, time) => rateToUSDTAt(asset, time, prices),
		});

		const avg = pos.avgBuyPriceUSDT;
		const costBasisUSDT = avg !== null ? avg * h.qty : null;
		const marketValueUSDT = currentPrice !== null ? currentPrice * h.qty : null;
		const unrealizedPnlUSDT =
			costBasisUSDT !== null && marketValueUSDT !== null
				? marketValueUSDT - costBasisUSDT
				: null;

		positions[h.asset] = {
			asset: h.asset,
			qty: h.qty,
			currentPriceUSDT: currentPrice,
			avgBuyPriceUSDT: avg,
			avgSellPriceUSDT: pos.avgSellPriceUSDT,
			// quantidade vendida no ciclo atual (base do preço médio de venda)
			soldQtyCycle: pos.soldQtyCycle,
			costBasisUSDT,
			marketValueUSDT,
			unrealizedPnlUSDT,
			unrealizedPnlPct:
				unrealizedPnlUSDT !== null && costBasisUSDT
					? (unrealizedPnlUSDT / costBasisUSDT) * 100
					: null,
			realizedPnlUSDT: pos.realizedPnlUSDT,
			investedUSDT: pos.investedUSDT,
			// quanto da quantidade atual é explicada pelos trades (depósitos/Convert/Earn não entram)
			coverage: h.qty > 0 ? Math.min(pos.trackedQty / h.qty, 1) : 0,
			tradesCount: trades.length,
			symbols: [...new Set(trades.map((t) => t.symbol))],
		};
	}

	const withCost = Object.values(positions).filter((p) => p.costBasisUSDT !== null);
	const total = (list, key) => list.reduce((acc, p) => acc + (p[key] ?? 0), 0);
	const totalCost = total(withCost, "costBasisUSDT");
	const totalUnrealized = total(withCost, "unrealizedPnlUSDT");

	return {
		positions,
		totals: {
			costBasisUSDT: totalCost,
			marketValueUSDT: total(withCost, "marketValueUSDT"),
			unrealizedPnlUSDT: totalUnrealized,
			unrealizedPnlPct: totalCost ? (totalUnrealized / totalCost) * 100 : null,
			realizedPnlUSDT: total(Object.values(positions), "realizedPnlUSDT"),
		},
		errors,
		generatedAt: Date.now(),
	};
}

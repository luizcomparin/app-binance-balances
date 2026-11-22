// Posições / P&L (rotas /positions e /avg-buy-prices): preço médio, custo, P&L realizado e não realizado.
import { getPriceInUSDT, resolveSymbol } from "../binance/market.js";
import { loadTradeHistory, rateToUSDTAt } from "./tradeHistory.js";

// Custo médio ponderado: compras aumentam quantidade e custo; vendas baixam a
// quantidade pelo custo médio vigente (o preço médio não muda) e geram lucro realizado.
// Taxas: em base reduzem a quantidade; em outra moeda (quote/BNB) entram no custo/receita.
function computePosition(asset, trades, prices, symbolInfo) {
	let qty = 0;
	let cost = 0;
	let realized = 0;
	let invested = 0;
	// vendas do ciclo atual (desde a compra que reabriu a posição zerada) → preço médio de venda
	let soldQtyCycle = 0;
	let soldValueCycle = 0;

	for (const t of trades) {
		const { quoteAsset } = resolveSymbol(t.symbol, symbolInfo);
		const tradeQty = Number(t.qty);
		const valueUSDT = Number(t.quoteQty) * rateToUSDTAt(quoteAsset, t.time, prices);

		const commission = Number(t.commission || 0);
		const feeInBase = t.commissionAsset === asset ? commission : 0;
		const feeUSDT =
			t.commissionAsset && t.commissionAsset !== asset
				? commission * rateToUSDTAt(t.commissionAsset, t.time, prices)
				: 0;

		if (t.isBuyer) {
			// posição zerada e nova compra: começa um ciclo novo, e as vendas antigas saem da média
			if (qty === 0) {
				soldQtyCycle = 0;
				soldValueCycle = 0;
			}
			qty += tradeQty - feeInBase;
			cost += valueUSDT + feeUSDT;
			invested += valueUSDT + feeUSDT;
		} else {
			const soldQty = tradeQty + feeInBase;
			const matchedQty = Math.min(soldQty, qty);
			const avg = qty > 0 ? cost / qty : 0;
			const proceeds = valueUSDT - feeUSDT;
			soldQtyCycle += soldQty;
			soldValueCycle += proceeds;

			// se vendeu mais do que os trades explicam (ex.: veio de depósito), só a
			// parte com custo conhecido entra no realizado
			realized += proceeds * (soldQty ? matchedQty / soldQty : 0) - avg * matchedQty;
			cost -= avg * matchedQty;
			qty -= matchedQty;
		}

		if (qty < 1e-12) {
			qty = 0;
			cost = 0;
		}
	}

	return {
		trackedQty: qty,
		avgBuyPriceUSDT: qty > 0 ? cost / qty : null,
		avgSellPriceUSDT: soldQtyCycle > 0 ? soldValueCycle / soldQtyCycle : null,
		soldQtyCycle,
		realizedPnlUSDT: realized,
		investedUSDT: invested,
	};
}

export async function buildPositions() {
	const { holdings, prices, symbolInfo, tradesByAsset, errors } = await loadTradeHistory();

	const positions = {};
	for (const h of holdings) {
		const trades = [...(tradesByAsset[h.asset] || [])].sort(
			(a, b) => a.time - b.time || a.id - b.id
		);
		const currentPrice = getPriceInUSDT(h.asset, prices);
		const pos = computePosition(h.asset, trades, prices, symbolInfo);

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

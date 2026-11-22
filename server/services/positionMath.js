// Conta do preço médio e do P&L de uma moeda a partir dos trades (função pura, sem rede).
// Separada de positions.js para poder ser testada sem a Binance (test/server/positionMath.test.js).
// quoteAssetOf(symbol) → moeda de cotação do par; rateAt(asset, time) → 1 asset em USDT naquela data.
// Custo médio ponderado: compras aumentam quantidade e custo; vendas baixam a
// quantidade pelo custo médio vigente (o preço médio não muda) e geram lucro realizado.
// Taxas: em base reduzem a quantidade; em outra moeda (quote/BNB) entram no custo/receita.
export function computePosition(asset, trades, { quoteAssetOf, rateAt }) {
	let qty = 0;
	let cost = 0;
	let realized = 0;
	let invested = 0;
	// vendas do ciclo atual (desde a compra que reabriu a posição zerada) → preço médio de venda
	let soldQtyCycle = 0;
	let soldValueCycle = 0;

	for (const t of trades) {
		const quoteAsset = quoteAssetOf(t.symbol);
		const tradeQty = Number(t.qty);
		const valueUSDT = Number(t.quoteQty) * rateAt(quoteAsset, t.time);

		const commission = Number(t.commission || 0);
		const feeInBase = t.commissionAsset === asset ? commission : 0;
		const feeUSDT =
			t.commissionAsset && t.commissionAsset !== asset
				? commission * rateAt(t.commissionAsset, t.time)
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

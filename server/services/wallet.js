// Carteira (rota /balances): saldos em USDT, participação, variação de 24h e moedas sem cotação.
import { getAccountBalances } from "../binance/account.js";
import { getPriceInUSDT, getTickers24h } from "../binance/market.js";

function sortByPercentage(rows) {
	return rows.sort((a, b) => b.pct - a.pct);
}

export async function buildWalletData() {
	const [balances, { prices: allPrices, openPrices }] = await Promise.all([
		getAccountBalances(),
		getTickers24h(),
	]);

	const nonZero = balances.filter(
		(b) => Number(b.free) > 0 || Number(b.locked) > 0
	);

	const usdtBrlPrice = Number(allPrices.USDTBRL || 0);
	const usdtBrlOpen = Number(openPrices.USDTBRL || 0);

	const rows = [];
	const unpriced = [];

	for (const b of nonZero) {
		const asset = b.asset;
		const free = Number(b.free);
		const locked = Number(b.locked);

		const price = getPriceInUSDT(asset, allPrices);

		if (price === null) {
			unpriced.push({ asset, qty: free + locked });
			continue;
		}

		const freeUSDT = free * price;
		const lockedUSDT = locked * price;
		const totalUSDT = freeUSDT + lockedUSDT;

		// variação de 24h em USDT (para BRL inclui a variação do câmbio)
		const openPrice = getPriceInUSDT(asset, openPrices);
		const totalUSDT24hAgo = openPrice ? (free + locked) * openPrice : null;

		rows.push({
			asset,
			qty: free + locked,
			priceUSDT: price,
			freeUSDT,
			lockedUSDT,
			totalUSDT,
			change24hPct: openPrice ? (price / openPrice - 1) * 100 : null,
			change24hUSDT: totalUSDT24hAgo !== null ? totalUSDT - totalUSDT24hAgo : null,
		});
	}

	const totalWalletUSDT = rows.reduce((acc, r) => acc + r.totalUSDT, 0);

	// variação da carteira considerando as quantidades atuais (ignora trades feitos nas 24h)
	const withChange = rows.filter((r) => r.change24hUSDT !== null);
	const change24hUSDT = withChange.reduce((acc, r) => acc + r.change24hUSDT, 0);
	const value24hAgo = withChange.reduce(
		(acc, r) => acc + r.totalUSDT - r.change24hUSDT,
		0
	);

	const processed = rows.map((r) => ({
		...r,
		pct: totalWalletUSDT ? (r.totalUSDT / totalWalletUSDT) * 100 : 0,
	}));

	return {
		total_usdt: totalWalletUSDT,
		usdt_brl_price: usdtBrlPrice || null,
		// variação de 24h do par USDT/BRL (gráfico de preço)
		usdt_brl_change_24h_pct: usdtBrlPrice && usdtBrlOpen ? (usdtBrlPrice / usdtBrlOpen - 1) * 100 : null,
		change_24h_usdt: change24hUSDT,
		change_24h_pct: value24hAgo ? (change24hUSDT / value24hAgo) * 100 : null,
		assets: sortByPercentage(processed),
		unpriced,
	};
}

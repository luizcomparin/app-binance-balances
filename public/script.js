// EXEMPLO DE COMENTÁRIO DE FUNÇÃO JSDOC
/**
 * Calculates the total price of items including tax.
 * @param {number[]} prices - The prices of the items.
 * @param {number} taxRate - The tax rate to apply.
 * @returns {number} The total price.
 */
function calculateTotalPrice(prices, taxRate) {
	let total = 0;
	for (const price of prices) {
		total += price;
	}
	return total * (1 + taxRate);
}

/* ---------------------------------------- */
/* PROTOTYPE FUNCTIONS                      */
/* ---------------------------------------- */

/**
 * Formata uma string como moeda no padrão brasileiro.
 * @returns {string} Valor formatado. Ex: "1.234,56"
 * @example
 * "1234.56".formatCurrency() // "1.234,56"
 * "invalid".formatCurrency() // "0,00"
 */
String.prototype.formatCurrency = function () {
	// Converte para número
	const numValue = parseFloat(this);

	// Verifica se é um número válido
	if (isNaN(numValue) || numValue === null || numValue === undefined) {
		return "0,00";
	}

	// Formata no padrão brasileiro
	return numValue.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
};

/**
 * Formata um número como moeda no padrão brasileiro.
 * @returns {string} Valor formatado. Ex: "1.234,56"
 * @example
 * (1234.56).formatCurrency() // "1.234,56"
 */
Number.prototype.formatCurrency = function () {
	// Verifica se é um número válido
	if (isNaN(this) || this === null || this === undefined) {
		return "0,00";
	}

	// Formata no padrão brasileiro
	return this.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
};

/* ---------------------------------------- */
/* LOADING                                  */
/* ---------------------------------------- */
function showLoading() {
	const overlay = document.getElementById("loading-overlay");
	if (overlay) {
		overlay.classList.remove("hidden");
	}
}

function hideLoading() {
	const overlay = document.getElementById("loading-overlay");
	if (overlay) {
		overlay.classList.add("hidden");
	}
}

/* ---------------------------------------- */
/* TABS                                     */
/* ---------------------------------------- */
const tabButtons = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");

function setActiveTab(tabName) {
	tabButtons.forEach((btn) => {
		const isActive = btn.dataset.tab === tabName;
		btn.classList.toggle("active", isActive);
	});

	tabPanels.forEach((panel) => {
		const isActive = panel.dataset.tab === tabName;
		panel.classList.toggle("active", isActive);
	});
}

if (tabButtons.length) {
	const activeBtn = document.querySelector(".tab.active") || tabButtons[0];
	setActiveTab(activeBtn.dataset.tab);

	tabButtons.forEach((btn) => {
		btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
	});
}

/* ---------------------------------------- */
/* CHART                                    */
/* ---------------------------------------- */

let walletChart = null;
let walletBarChart = null;

function renderWalletChart(assets) {
	const ctx = document.getElementById("walletChart");
	if (!ctx) return;

	// Agrupar ativos
	const usdt = assets.find((a) => a.asset === "USDT");
	const btc = assets.find((a) => a.asset === "BTC");
	const xrp = assets.find((a) => a.asset === "XRP");
	const eth = assets.find((a) => a.asset === "ETH");
	const others = assets.filter(
		(a) =>
			a.asset !== "USDT" &&
			a.asset !== "BTC" &&
			a.asset !== "XRP" &&
			a.asset !== "ETH"
	);

	const labels = [];
	const data = [];
	const colors = [];
	const valueMap = new Map();

	if (usdt && usdt.pct > 0) {
		labels.push("USDT");
		data.push(usdt.pct);
		colors.push("rgba(77, 212, 255, 0.8)");
		valueMap.set("USDT", { pct: usdt.pct, usdt: usdt.totalUSDT });
	}

	if (btc && btc.pct > 0) {
		labels.push("BTC");
		data.push(btc.pct);
		colors.push("rgba(247, 147, 26, 0.8)");
		valueMap.set("BTC", { pct: btc.pct, usdt: btc.totalUSDT });
	}

	if (xrp && xrp.pct > 0) {
		labels.push("XRP");
		data.push(xrp.pct);
		colors.push("rgba(107, 242, 197, 0.8)");
		valueMap.set("XRP", { pct: xrp.pct, usdt: xrp.totalUSDT });
	}

	if (eth && eth.pct > 0) {
		labels.push("ETH");
		data.push(eth.pct);
		colors.push("rgba(138, 43, 226, 0.8)"); // Purple color for ETH
		valueMap.set("ETH", { pct: eth.pct, usdt: eth.totalUSDT });
	}

	const othersTotal = others.reduce((acc, a) => acc + a.pct, 0);
	if (othersTotal > 0) {
		labels.push("Outros");
		data.push(othersTotal);
		colors.push("rgba(155, 176, 214, 0.8)");
		const othersTotalUsdt = others.reduce((acc, a) => acc + a.totalUSDT, 0);
		valueMap.set("Outros", { pct: othersTotal, usdt: othersTotalUsdt });
	}

	// Destruir gráfico anterior se existir
	if (walletChart) {
		walletChart.destroy();
	}

	// Criar novo gráfico
	walletChart = new Chart(ctx, {
		type: "pie",
		data: {
			labels: labels,
			datasets: [
				{
					data: data,
					backgroundColor: colors,
					borderColor: "#11172e",
					borderWidth: 3,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "bottom",
					labels: {
						color: "#e5ecff",
						padding: 15,
						font: {
							size: 13,
							family: "Manrope",
						},
					},
				},
				tooltip: {
					backgroundColor: "#11172e",
					titleColor: "#4dd4ff",
					bodyColor: "#e5ecff",
					borderColor: "rgba(255, 255, 255, 0.08)",
					borderWidth: 1,
					padding: 12,
					displayColors: true,
					callbacks: {
						label: function (context) {
							const label = context.label || "";
							const entry = valueMap.get(label);
							const pct = entry ? entry.pct : context.parsed || 0;
							const usdtValue = entry ? entry.usdt : 0;
							const brlValue = usdtBrlPrice
								? usdtValue * usdtBrlPrice
								: null;
							const brlText = usdtBrlPrice
								? `${brlValue.toFixed(2).formatCurrency()} BRL`
								: "--";
							return [
								` ${label}: ${pct.toFixed(2)}%`,
								` USDT: ${usdtValue
									.toFixed(2)
									.formatCurrency()} USDT`,
								` BRL: ${brlText}`,
							];
						},
					},
				},
			},
		},
	});
}

function renderWalletBarChart(assets) {
	const ctx = document.getElementById("walletBarChart");
	if (!ctx) return;

	// Pegar todos os ativos ordenados por valor
	const sortedAssets = [...assets].sort((a, b) => b.totalUSDT - a.totalUSDT);
	const totalWalletUsdt = assets.reduce((acc, a) => acc + a.totalUSDT, 0);
	const assetMap = new Map(sortedAssets.map((asset) => [asset.asset, asset]));

	const labels = sortedAssets.map((a) => a.asset);
	const data = sortedAssets.map((a) => a.totalUSDT);
	const colors = sortedAssets.map((a) => {
		if (a.asset === "USDT") return "rgba(77, 212, 255, 0.8)";
		if (a.asset === "BTC") return "rgba(247, 147, 26, 0.8)";
		if (a.asset === "XRP") return "rgba(107, 242, 197, 0.8)";
		if (a.asset === "ETH") return "rgba(138, 43, 226, 0.8)";
		return "rgba(155, 176, 214, 0.8)";
	});

	// Destruir gráfico anterior se existir
	if (walletBarChart) {
		walletBarChart.destroy();
	}

	// Criar novo gráfico
	walletBarChart = new Chart(ctx, {
		type: "bar",
		data: {
			labels: labels,
			datasets: [
				{
					label: "Valor em USDT",
					data: data,
					backgroundColor: colors,
					borderColor: "#11172e",
					borderWidth: 2,
					borderRadius: 6,
				},
			],
		},
		options: {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					backgroundColor: "#11172e",
					titleColor: "#4dd4ff",
					bodyColor: "#e5ecff",
					borderColor: "rgba(255, 255, 255, 0.08)",
					borderWidth: 1,
					padding: 12,
					displayColors: true,
					callbacks: {
						label: function (context) {
							const label = context.label || "";
							const asset = assetMap.get(label);
							const usdtValue = asset
								? asset.totalUSDT
								: context.parsed.x || 0;
							const pct = totalWalletUsdt
								? (usdtValue / totalWalletUsdt) * 100
								: 0;
							const brlValue = usdtBrlPrice
								? usdtValue * usdtBrlPrice
								: null;
							const brlText = usdtBrlPrice
								? `${brlValue.toFixed(2).formatCurrency()} BRL`
								: "--";

							return [
								` ${label}: ${pct.toFixed(2)}%`,
								` USDT: ${usdtValue
									.toFixed(2)
									.formatCurrency()} USDT`,
								` BRL: ${brlText}`,
							];
						},
					},
				},
			},
			scales: {
				x: {
					grid: {
						color: "rgba(255, 255, 255, 0.05)",
					},
					ticks: {
						color: "#9bb0d6",
						font: {
							size: 11,
							family: "Manrope",
						},
					},
				},
				y: {
					grid: {
						display: false,
					},
					ticks: {
						color: "#e5ecff",
						font: {
							size: 12,
							family: "Manrope",
							weight: "600",
						},
					},
				},
			},
		},
	});
}

/* ---------------------------------------- */
/* BALANCES                                 */
/* ---------------------------------------- */

let currentAssets = []; // Novo: armazenar ativos atuais para simulação
let usdtBrlPrice = 0;

async function loadBalances() {
	const tbody = document.querySelector("#table-body-balances");
	const summaryTbody = document.querySelector("#table-body-asset-stats");

	tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";
	if (summaryTbody) {
		summaryTbody.innerHTML = "<tr><td colspan='6'>Carregando...</td></tr>";
	}

	try {
		const [data, raw, avgPrices] = await Promise.all([
			fetch("http://localhost:3000/balances").then((x) => x.json()),
			fetch("http://localhost:3000/raw")
				.then((x) => x.json())
				.catch(() => null),
			// fetch("http://localhost:3000/avg-buy-prices")
			// 	.then((x) => x.json())
			// 	.catch(() => ({})),
		]);

		const totalUsdt = data.total_usdt.toFixed(2);
		usdtBrlPrice = Number(data.usdt_brl_price || 0);

		tbody.innerHTML = "";
		/** @asset string */
		data.assets.forEach((asset) => {
			tbody.innerHTML += `
          <tr>
            <td>${asset.asset}</td>
            <td>${asset.pct.toFixed(2)}%</td>
            <td>${asset.freeUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.lockedUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.totalUSDT.toFixed(2).formatCurrency()} USDT</td>
          </tr>
        `;
		});

		currentAssets = data.assets; // Novo: salvar ativos para simulação

		const totalBalanceDivs = document.querySelectorAll("#total-balance");
		const totalBrlDiv = document.getElementById("total-brl");
		// totalDiv.innerText = "Total da carteira: " + data.total_usdt.toFixed(2) + " USDT";
		totalBalanceDivs.forEach((totalBalanceDiv) => {
			totalBalanceDiv.innerText = `${totalUsdt.formatCurrency()} USDT`;
		});

		const usdtPercentDiv = document.getElementById("usdt-percent");
		const btcPercentDiv = document.getElementById("btc-percent");
		const xrpPercentDiv = document.getElementById("xrp-percent");
		const ethPercentDiv = document.getElementById("eth-percent");
		const othersPercentDiv = document.getElementById("others-percent");
		const usdtUsdtDiv = document.getElementById("usdt-usdt");
		const btcUsdtDiv = document.getElementById("btc-usdt");
		const xrpUsdtDiv = document.getElementById("xrp-usdt");
		const ethUsdtDiv = document.getElementById("eth-usdt");
		const othersUsdtDiv = document.getElementById("others-usdt");
		const usdtBrlDiv = document.getElementById("usdt-brl");
		const btcBrlDiv = document.getElementById("btc-brl");
		const xrpBrlDiv = document.getElementById("xrp-brl");
		const ethBrlDiv = document.getElementById("eth-brl");
		const othersBrlDiv = document.getElementById("others-brl");

		const usdtAsset = data.assets.find((a) => a.asset === "USDT");
		const btcAsset = data.assets.find((a) => a.asset === "BTC");
		const xrpAsset = data.assets.find((a) => a.asset === "XRP");
		const ethAsset = data.assets.find((a) => a.asset === "ETH");
		const othersTotalUsdt = data.assets
			.filter(
				(a) =>
					a.asset !== "USDT" &&
					a.asset !== "BTC" &&
					a.asset !== "XRP" &&
					a.asset !== "ETH"
			)
			.reduce((acc, a) => acc + a.totalUSDT, 0);

		usdtPercentDiv.innerText = `${usdtAsset?.pct.toFixed(2) || 0}%`;
		btcPercentDiv.innerText = `${btcAsset?.pct.toFixed(2) || 0}%`;
		xrpPercentDiv.innerText = `${xrpAsset?.pct.toFixed(2) || 0}%`;
		ethPercentDiv.innerText = `${ethAsset?.pct.toFixed(2) || 0}%`;
		othersPercentDiv.innerText = `${data.assets
			.filter(
				(a) =>
					a.asset !== "USDT" &&
					a.asset !== "BTC" &&
					a.asset !== "XRP" &&
					a.asset !== "ETH"
			)
			.reduce((acc, a) => acc + a.pct, 0)
			.toFixed(2)}%`;
		usdtUsdtDiv.innerText = `${
			usdtAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
		} USDT`;
		btcUsdtDiv.innerText = `${
			btcAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
		} USDT`;
		xrpUsdtDiv.innerText = `${
			xrpAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
		} USDT`;
		ethUsdtDiv.innerText = `${
			ethAsset?.totalUSDT.toFixed(2).formatCurrency() || 0
		} USDT`;
		othersUsdtDiv.innerText = `${othersTotalUsdt
			.toFixed(2)
			.formatCurrency()} USDT`;

		const setBrlValue = (element, usdtValue) => {
			if (!element) return;
			if (!usdtBrlPrice) {
				element.innerText = "--";
				return;
			}
			const brl = usdtValue * usdtBrlPrice;
			element.innerText = `${brl.toFixed(2).formatCurrency()} BRL`;
		};

		setBrlValue(totalBrlDiv, Number(data.total_usdt || 0));
		setBrlValue(usdtBrlDiv, Number(usdtAsset?.totalUSDT || 0));
		setBrlValue(btcBrlDiv, Number(btcAsset?.totalUSDT || 0));
		setBrlValue(xrpBrlDiv, Number(xrpAsset?.totalUSDT || 0));
		setBrlValue(ethBrlDiv, Number(ethAsset?.totalUSDT || 0));
		setBrlValue(othersBrlDiv, Number(othersTotalUsdt || 0));

		// const quantityMap = raw ? mapQuantities(raw.balances) : {};
		// if (summaryTbody) {
		// await renderAssetSummary(data.assets, quantityMap, avgPrices);
		// }

		// Renderizar gráficos
		renderWalletChart(data.assets);
		renderWalletBarChart(data.assets);
	} catch (e) {
		tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro: ${e}</td></tr>`;
		if (summaryTbody) {
			summaryTbody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro: ${e}</td></tr>`;
		}
	}
}

function mapQuantities(rawBalances = []) {
	return rawBalances.reduce((acc, item) => {
		const qty = Number(item.free) + Number(item.locked);
		if (qty > 0) acc[item.asset] = qty;
		return acc;
	}, {});
}

// const AVG_PRICE_CACHE = {};

// function getAveragePurchasePrice(asset, avgPriceMap = {}) {
// 	if (asset === "USDT" || asset === "BUSD") return 1;
// 	const cached = AVG_PRICE_CACHE[asset];
// 	if (cached !== undefined) return cached;

// 	const fromApi = avgPriceMap[asset];
// 	if (fromApi === null || fromApi === undefined || Number.isNaN(fromApi)) {
// 		AVG_PRICE_CACHE[asset] = null;
// 		return null;
// 	}

// 	AVG_PRICE_CACHE[asset] = Number(fromApi);
// 	return AVG_PRICE_CACHE[asset];
// }

// function formatMaybeNumber(value, digits = 2, unit = "", nullLabel = "NULL") {
// 	if (value === null || value === undefined || Number.isNaN(value)) {
// 		return nullLabel;
// 	}
// 	const formatted = Number(value).toFixed(digits);
// 	return unit ? `${formatted} ${unit}` : formatted;
// }

// // Resumo dos Ativos: Renderiza o resumo dos ativos com base na quantidade e preço médio
// async function renderAssetSummary(assets, quantityMap, avgPriceMap = {}) {
// 	const tbody = document.querySelector("#table-body-asset-stats");
// 	if (!tbody) return;

// 	tbody.innerHTML = "<tr><td colspan='6'>Carregando...</td></tr>";

// 	const rows = await Promise.all(
// 		assets.map(async (asset) => {
// 			const qty = quantityMap[asset.asset] || 0;
// 			const hasQty = qty > 0;

// 			const avgPrice = getAveragePurchasePrice(asset.asset, avgPriceMap);

// 			const cost = hasQty && avgPrice !== null ? avgPrice * qty : null;
// 			const currentValue = hasQty ? asset.totalUSDT : null;
// 			const valorizacao =
// 				cost !== null && currentValue !== null
// 					? cost - currentValue
// 					: null;

// 			return {
// 				asset: asset.asset,
// 				avgPrice,
// 				qty,
// 				cost,
// 				currentValue,
// 				valorizacao: valorizacao * -1,
// 			};
// 		})
// 	);

// 	if (!rows.length) {
// 		tbody.innerHTML =
// 			"<tr><td colspan='6'>Nenhum ativo com dados suficientes.</td></tr>";
// 		return;
// 	}

// 	tbody.innerHTML = rows
// 		.map(
// 			(row) => `
//         <tr>
//           <td>${row.asset}</td>
//           <td>${formatMaybeNumber(row.avgPrice, 5, "USDT")}</td>
//           <td>${formatMaybeNumber(row.qty, 6, row.asset)}</td>
//           <td>${formatMaybeNumber(row.cost, 2, "USDT")}</td>
//           <td>${formatMaybeNumber(row.currentValue, 2, "USDT")}</td>
//           <td class="${
// 				row.valorizacao > 0
// 					? "positive"
// 					: row.valorizacao < 0
// 					? "negative"
// 					: ""
// 			}">${formatMaybeNumber(row.valorizacao, 2, "USDT")}</td>
//         </tr>
//       `
// 		)
// 		.join("");
// }

/* ---------------------------------------- */
/* SIMULAÇÃO DE VALORIZAÇÃO               */
/* ---------------------------------------- */

function openSimulationDialog() {
	if (!currentAssets.length) {
		alert("Carregue a carteira primeiro.");
		return;
	}

	const inputsDiv = document.getElementById("simulation-inputs");
	inputsDiv.innerHTML = "";

	currentAssets.forEach((asset) => {
		const div = document.createElement("div");
		div.setAttribute("data-asset", asset.asset);
		div.innerHTML = `
      <label>${asset.asset} (${asset.totalUSDT
			.toFixed(2)
			.formatCurrency()} USDT):</label>
      <input type="number" id="sim-${asset.asset}" placeholder="0" step="0.01">
    `;
		inputsDiv.appendChild(div);
	});

	// Adicionar listeners para atualização em tempo real nos inputs de porcentagem
	const inputs = inputsDiv.querySelectorAll("input[type='number']");
	inputs.forEach((input) =>
		input.addEventListener("input", calculateSimulation)
	);

	// Adicionar listener para o filtro de busca
	const searchInput = document.getElementById("simulation-search");
	searchInput.addEventListener("input", filterAssets);

	document.getElementById("simulation-modal").style.display = "flex";
	calculateSimulation(); // Calcular e mostrar resultado inicial
}

function closeSimulationDialog() {
	document.getElementById("simulation-modal").style.display = "none";
}

function calculateSimulation() {
	let newTotal = 0;

	currentAssets.forEach((asset) => {
		const input = document.getElementById(`sim-${asset.asset}`);
		const percent = parseFloat(input.value) || 0;
		const changeFactor = 1 + percent / 100;
		const newValue = asset.totalUSDT * changeFactor;
		newTotal += newValue;
	});

	document.getElementById(
		"simulation-result"
	).innerText = `Valor estimado da carteira: \n ${newTotal
		.toFixed(2)
		.formatCurrency()} USDT`;
}

function filterAssets() {
	const searchTerm = document
		.getElementById("simulation-search")
		.value.toLowerCase();
	const assetDivs = document.querySelectorAll("#simulation-inputs div");

	assetDivs.forEach((div) => {
		const asset = div.getAttribute("data-asset").toLowerCase();
		if (asset.includes(searchTerm)) {
			div.style.display = "flex";
		} else {
			div.style.display = "none";
		}
	});
}

/* ---------------------------------------- */
/* ORDERS (with filters)                    */
/* ---------------------------------------- */

let ORDERS = [];
let FILTERED = [];
let currentSort = { key: null, asc: true };
let pairs = [];
let totalsByPair = {};

async function loadOrders() {
	const tbody = document.querySelector("#table-body-orders");
	tbody.innerHTML = "<tr><td colspan='7'>Carregando...</td></tr>";

	try {
		const json = await fetch("http://localhost:3000/orders").then((x) =>
			x.json()
		);

		ORDERS = [];

		// Flatten the object into an array
		for (const base in json) {
			json[base].forEach((order) => {
				if (pairs.find((item) => item === order.symbol) === undefined) {
					pairs.push(order.symbol);
				}

				ORDERS.push({
					pair: order.symbol,
					side: order.side,
					type: order.type,
					price: Number(order.price),
					amount: Number(order.origQty),
					total: Number(order.price) * Number(order.origQty),
					time: order.time,
				});
			});
		}
		createOrderFilters();
		applyOrderFilters();
	} catch (e) {
		tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Erro: ${e}</td></tr>`;
	}
}

function createOrderFilters() {
	const pairSelect = document.getElementById("filterPair");
	pairSelect.innerHTML = pairs
		.map((item) => `<option value="${item}">${item}</option> `)
		.toString(); // aqui o forloop
	pairSelect.innerHTML =
		'<option value="">Todos</option>' + pairSelect.innerHTML;
}

function applyOrderFilters() {
	const pair = document
		.getElementById("filterPair")
		.value.trim()
		.toUpperCase();

	const side = document.getElementById("filterSide").value;

	FILTERED = ORDERS.filter(
		(o) =>
			(pair === "" || o.pair.includes(pair)) &&
			(side === "ALL" || o.side === side)
	);

	totalsByPair = calculateTotalsByPair(FILTERED);
	renderOrders();
}

function sortOrders(key) {
	if (currentSort.key === key) currentSort.asc = !currentSort.asc;
	else {
		currentSort.key = key;
		currentSort.asc = true;
	}

	totalsByPair = calculateTotalsByPair(FILTERED);
	FILTERED.sort((a, b) => {
		if (key === "total") {
			const totalA = totalsByPair[a.pair] || 0;
			const totalB = totalsByPair[b.pair] || 0;
			if (totalA < totalB) return currentSort.asc ? -1 : 1;
			if (totalA > totalB) return currentSort.asc ? 1 : -1;
			// fallback keeps rows with the same pair grouped deterministically
			return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
		}

		const A = a[key],
			B = b[key];
		if (A < B) return currentSort.asc ? -1 : 1;
		if (A > B) return currentSort.asc ? 1 : -1;
		return 0;
	});

	renderOrders();
}

function calculateTotalsByPair(orders) {
	return orders.reduce((totals, order) => {
		totals[order.pair] = (totals[order.pair] || 0) + order.total;
		return totals;
	}, {});
}

function renderOrders() {
	const tbody = document.querySelector("#table-body-orders");
	const totalOrdersDiv = document.querySelector("#total-orders");

	tbody.innerHTML = "";

	let lastPair = null;
	let total = 0;

	// Novo: somatorio por par
	totalsByPair = calculateTotalsByPair(FILTERED);

	FILTERED.forEach((o) => {
		total += o.total;

		// Group header by pair
		if (o.pair !== lastPair) {
			// tbody.innerHTML += `<tr class="group-header" data-group="${o.pair}"><td colspan="7">${o.pair}</td></tr>`;
			const pairTotal = totalsByPair[o.pair].toFixed(2);
			tbody.innerHTML += `
            <tr class="group-header" data-group="${o.pair}">
                <td colspan="4">${o.pair}</td>
                <td colspan="1">${pairTotal.formatCurrency()} USDT</td>
                <td colspan="1"></td>
            </tr>`;

			lastPair = o.pair;
		}

		const formattedDate = new Date(o.time).toLocaleString("pt-BR");

		// <td>${o.type}</td>
		tbody.innerHTML += `
        <tr data-group="${o.pair}">
          <td>${o.pair}</td>
          <td class="${o.side === "BUY" ? "buy" : "sell"}">${o.side}</td>
          <td>${o.price.toFixed(5).formatCurrency()} USDT</td>
          <td>${o.amount.toFixed(8)}</td>
          <td>${o.total.toFixed(2).formatCurrency()} USDT</td>
          <td>${formattedDate}</td>
        </tr>
      `;
	});

	totalOrdersDiv.innerHTML =
		"Total das ordens abertas filtradas: <b>" +
		total.toFixed(2).formatCurrency() +
		" USDT</b>";

	if (!FILTERED.length) {
		tbody.innerHTML =
			"<tr><td colspan='7'>Nenhuma ordem encontrada para os filtros.</td></tr>";
	}

	activateGroupAccordions();
}

/* --------------------------------------------- */
/* ACCORDION POR GROUP-HEADER (NOVO)             */
/* --------------------------------------------- */

function activateGroupAccordions() {
	const rows = document.querySelectorAll(
		"#table-body-orders tr.group-header"
	);

	rows.forEach((header) => {
		header.style.cursor = "pointer";

		const group = header.dataset.group;
		let current = header.nextElementSibling;

		// --- INICIAR FECHADO ---
		header.classList.add("group-collapsed");

		while (current && !current.classList.contains("group-header")) {
			if (current.dataset.group === group) {
				current.style.display = "none"; // fecha na inicialização
			}
			current = current.nextElementSibling;
		}

		// --- CLICK TOGGLE ---
		header.addEventListener("click", () => {
			const isHidden = header.classList.toggle("group-collapsed");
			let c = header.nextElementSibling;

			while (c && !c.classList.contains("group-header")) {
				if (c.dataset.group === group) {
					c.style.display = isHidden ? "none" : "table-row";
				}
				c = c.nextElementSibling;
			}
		});
	});
}

/* INIT */
showLoading();
Promise.all([loadBalances(), loadOrders()]).finally(() => hideLoading());

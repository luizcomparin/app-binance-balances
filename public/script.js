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
/* ACCORDION                                */
/* ---------------------------------------- */
document.querySelectorAll(".accordion").forEach((acc) => {
	acc.addEventListener("click", () => {
		acc.classList.toggle("active");
		const panel = acc.nextElementSibling;
		panel.style.display =
			panel.style.display === "block" ? "none" : "block";
	});
});

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

	if (usdt && usdt.pct > 0) {
		labels.push("USDT");
		data.push(usdt.pct);
		colors.push("rgba(77, 212, 255, 0.8)");
	}

	if (btc && btc.pct > 0) {
		labels.push("BTC");
		data.push(btc.pct);
		colors.push("rgba(247, 147, 26, 0.8)");
	}

	if (xrp && xrp.pct > 0) {
		labels.push("XRP");
		data.push(xrp.pct);
		colors.push("rgba(107, 242, 197, 0.8)");
	}

	if (eth && eth.pct > 0) {
		labels.push("ETH");
		data.push(eth.pct);
		colors.push("rgba(138, 43, 226, 0.8)"); // Purple color for ETH
	}

	const othersTotal = others.reduce((acc, a) => acc + a.pct, 0);
	if (othersTotal > 0) {
		labels.push("Outros");
		data.push(othersTotal);
		colors.push("rgba(155, 176, 214, 0.8)");
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
							const value = context.parsed || 0;
							return ` ${label}: ${value.toFixed(2)}%`;
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
							const value = context.parsed.x || 0;
							return ` Valor: ${value.toFixed(2)} USDT`;
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
			fetch("http://localhost:3000/avg-buy-prices")
				.then((x) => x.json())
				.catch(() => ({})),
		]);

		const totalUsdt = data.total_usdt.toFixed(2);

		tbody.innerHTML = "";
		data.assets.forEach((asset) => {
			tbody.innerHTML += `
          <tr>
            <td>${asset.asset}</td>
            <td>${asset.totalUSDT.toFixed(2)}</td>
            <td>${asset.pct.toFixed(2)}%</td>
            <td>${asset.freeUSDT.toFixed(2)}</td>
            <td>${asset.lockedUSDT.toFixed(2)}</td>
          </tr>
        `;
		});

		currentAssets = data.assets; // Novo: salvar ativos para simulação

		const totalBalanceDivs = document.querySelectorAll("#total-balance");
		// totalDiv.innerText = "Total da carteira: " + data.total_usdt.toFixed(2) + " USDT";
		totalBalanceDivs.forEach((totalBalanceDiv) => {
			totalBalanceDiv.innerText = `${totalUsdt} USDT`;
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
		usdtPercentDiv.innerText = `${
			data.assets.find((a) => a.asset === "USDT")?.pct.toFixed(2) || 0
		}%`;
		btcPercentDiv.innerText = `${
			data.assets.find((a) => a.asset === "BTC")?.pct.toFixed(2) || 0
		}%`;
		xrpPercentDiv.innerText = `${
			data.assets.find((a) => a.asset === "XRP")?.pct.toFixed(2) || 0
		}%`;
		ethPercentDiv.innerText = `${
			data.assets.find((a) => a.asset === "ETH")?.pct.toFixed(2) || 0
		}%`;
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
			data.assets.find((a) => a.asset === "USDT")?.totalUSDT.toFixed(2) ||
			0
		} USDT`;
		btcUsdtDiv.innerText = `${
			data.assets.find((a) => a.asset === "BTC")?.totalUSDT.toFixed(2) ||
			0
		} USDT`;
		xrpUsdtDiv.innerText = `${
			data.assets.find((a) => a.asset === "XRP")?.totalUSDT.toFixed(2) ||
			0
		} USDT`;
		ethUsdtDiv.innerText = `${
			data.assets.find((a) => a.asset === "ETH")?.totalUSDT.toFixed(2) ||
			0
		} USDT`;
		othersUsdtDiv.innerText = `${data.assets
			.filter(
				(a) =>
					a.asset !== "USDT" &&
					a.asset !== "BTC" &&
					a.asset !== "XRP" &&
					a.asset !== "ETH"
			)
			.reduce((acc, a) => acc + a.totalUSDT, 0)
			.toFixed(2)} USDT`;

		const quantityMap = raw ? mapQuantities(raw.balances) : {};
		if (summaryTbody) {
			await renderAssetSummary(data.assets, quantityMap, avgPrices);
		}

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

const AVG_PRICE_CACHE = {};

function getAveragePurchasePrice(asset, avgPriceMap = {}) {
	if (asset === "USDT" || asset === "BUSD") return 1;
	const cached = AVG_PRICE_CACHE[asset];
	if (cached !== undefined) return cached;

	const fromApi = avgPriceMap[asset];
	if (fromApi === null || fromApi === undefined || Number.isNaN(fromApi)) {
		AVG_PRICE_CACHE[asset] = null;
		return null;
	}

	AVG_PRICE_CACHE[asset] = Number(fromApi);
	return AVG_PRICE_CACHE[asset];
}

function formatMaybeNumber(value, digits = 2, unit = "", nullLabel = "NULL") {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return nullLabel;
	}
	const formatted = Number(value).toFixed(digits);
	return unit ? `${formatted} ${unit}` : formatted;
}

async function renderAssetSummary(assets, quantityMap, avgPriceMap = {}) {
	const tbody = document.querySelector("#table-body-asset-stats");
	if (!tbody) return;

	tbody.innerHTML = "<tr><td colspan='6'>Carregando...</td></tr>";

	const rows = await Promise.all(
		assets.map(async (asset) => {
			const qty = quantityMap[asset.asset] || 0;
			const hasQty = qty > 0;

			const avgPrice = getAveragePurchasePrice(asset.asset, avgPriceMap);

			const cost = hasQty && avgPrice !== null ? avgPrice * qty : null;
			const currentValue = hasQty ? asset.totalUSDT : null;
			const valorizacao =
				cost !== null && currentValue !== null
					? cost - currentValue
					: null;

			return {
				asset: asset.asset,
				avgPrice,
				qty,
				cost,
				currentValue,
				valorizacao: valorizacao * -1,
			};
		})
	);

	if (!rows.length) {
		tbody.innerHTML =
			"<tr><td colspan='6'>Nenhum ativo com dados suficientes.</td></tr>";
		return;
	}

	tbody.innerHTML = rows
		.map(
			(row) => `
        <tr>
          <td>${row.asset}</td>
          <td>${formatMaybeNumber(row.avgPrice, 5, "USDT")}</td>
          <td>${formatMaybeNumber(row.qty, 6, row.asset)}</td>
          <td>${formatMaybeNumber(row.cost, 2, "USDT")}</td>
          <td>${formatMaybeNumber(row.currentValue, 2, "USDT")}</td>
          <td class="${
				row.valorizacao > 0
					? "positive"
					: row.valorizacao < 0
					? "negative"
					: ""
			}">${formatMaybeNumber(row.valorizacao, 2, "USDT")}</td>
        </tr>
      `
		)
		.join("");
}

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
      <label>${asset.asset} (${asset.totalUSDT.toFixed(2)} USDT):</label>
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
	).innerText = `Valor estimado da carteira: \n ${newTotal.toFixed(2)} USDT`;
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
                <td colspan="5">${o.pair}</td>
                <td colspan="1">${pairTotal}</td>
                <td colspan="1"></td>
            </tr>`;

			lastPair = o.pair;
		}

		const formattedDate = new Date(o.time).toLocaleString("pt-BR");

		tbody.innerHTML += `
        <tr data-group="${o.pair}">
          <td>${o.pair}</td>
          <td class="${o.side === "BUY" ? "buy" : "sell"}">${o.side}</td>
          <td>${o.type}</td>
          <td>${o.price.toFixed(5)}</td>
          <td>${o.amount.toFixed(8)}</td>
          <td>${o.total.toFixed(2)}</td>
          <td>${formattedDate}</td>
        </tr>
      `;
	});

	totalOrdersDiv.innerHTML =
		"Total das ordens abertas filtradas: <b>" +
		total.toFixed(2) +
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

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
/* BALANCES                                 */
/* ---------------------------------------- */

async function loadBalances() {
	const tbody = document.querySelector("#table-body-balances");
	const totalBalanceDivs = document.querySelectorAll("#total-balance");
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

		// totalDiv.innerText = "Total da carteira: " + data.total_usdt.toFixed(2) + " USDT";
		totalBalanceDivs.forEach((totalBalanceDiv) => {
			totalBalanceDiv.innerText =
				"Total da carteira: " + data.total_usdt.toFixed(2) + " USDT";
		});

		const quantityMap = raw ? mapQuantities(raw.balances) : {};
		if (summaryTbody) {
			await renderAssetSummary(data.assets, quantityMap, avgPrices);
		}
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

/* ---------------------------------------------
   ACCORDION POR GROUP-HEADER (NOVO)
--------------------------------------------- */

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
loadBalances();
loadOrders();

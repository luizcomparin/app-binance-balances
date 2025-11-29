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

	tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

	try {
		const data = await fetch("http://localhost:3000/balances").then((x) =>
			x.json()
		);

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

		// const totalBalanceDivs = document.querySelectorAll("#total-usdt");
		// .forEach((totalBalanceDiv) => {
		// 	totalBalanceDiv.innerText =
		// 		"Total da carteira: " + data.total_usdt.toFixed(2) + " USDT";
		// });
	} catch (e) {
		tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro: ${e}</td></tr>`;
	}
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

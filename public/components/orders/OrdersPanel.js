import { fetchOrders } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { toggleSort, compareValues } from "../../core/sort.js";

export async function loadOrders() {
  const tbody = document.querySelector("#table-body-orders");
  if (tbody) {
    tbody.innerHTML = "<tr><td colspan='7'>Carregando...</td></tr>";
  }

  try {
    const json = await fetchOrders();

    state.orders = [];

    for (const base in json) {
      json[base].forEach((order) => {
        if (state.pairs.find((item) => item === order.symbol) === undefined) {
          state.pairs.push(order.symbol);
        }

        state.orders.push({
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
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Erro: ${e}</td></tr>`;
    }
  }
}

function createOrderFilters() {
  const pairSelect = document.getElementById("filterPair");
  if (!pairSelect) return;

  pairSelect.innerHTML = state.pairs
    .map((item) => `<option value="${item}">${item}</option> `)
    .toString();
  pairSelect.innerHTML = '<option value="">Todos</option>' + pairSelect.innerHTML;
}

export function applyOrderFilters() {
  const pair = document.getElementById("filterPair")?.value.trim().toUpperCase();
  const side = document.getElementById("filterSide")?.value;

  state.filteredOrders = state.orders.filter(
    (o) =>
      (pair === "" || o.pair.includes(pair)) &&
      (side === "ALL" || o.side === side)
  );

  state.totalsByPair = calculateTotalsByPair(state.filteredOrders);
  renderOrders();
}

export function sortOrders(key) {
  toggleSort(state.orderSort, key);

  state.totalsByPair = calculateTotalsByPair(state.filteredOrders);
  state.filteredOrders.sort((a, b) => {
    if (key === "total") {
      const totalA = state.totalsByPair[a.pair] || 0;
      const totalB = state.totalsByPair[b.pair] || 0;
      const totalCompare = compareValues(totalA, totalB, state.orderSort.asc);
      if (totalCompare !== 0) return totalCompare;
      return compareValues(a.time, b.time, true);
    }

    const A = a[key],
      B = b[key];
    return compareValues(A, B, state.orderSort.asc);
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
  if (!tbody) return;

  tbody.innerHTML = "";

  let lastPair = null;
  let total = 0;

  state.totalsByPair = calculateTotalsByPair(state.filteredOrders);

  state.filteredOrders.forEach((o) => {
    total += o.total;

    if (o.pair !== lastPair) {
      const pairTotal = state.totalsByPair[o.pair].toFixed(2);
      tbody.innerHTML += `
            <tr class="group-header" data-group="${o.pair}">
                <td colspan="4">${o.pair}</td>
                <td colspan="1">${pairTotal.formatCurrency()} USDT</td>
                <td colspan="1"></td>
            </tr>`;

      lastPair = o.pair;
    }

    const formattedDate = new Date(o.time).toLocaleString("pt-BR");

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

  if (totalOrdersDiv) {
    totalOrdersDiv.innerHTML =
      "Total das ordens abertas filtradas: <b>" +
      total.toFixed(2).formatCurrency() +
      " USDT</b>";
  }

  if (!state.filteredOrders.length) {
    tbody.innerHTML =
      "<tr><td colspan='7'>Nenhuma ordem encontrada para os filtros.</td></tr>";
  }

  activateGroupAccordions();
}

function activateGroupAccordions() {
  const rows = document.querySelectorAll("#table-body-orders tr.group-header");

  rows.forEach((header) => {
    header.style.cursor = "pointer";

    const group = header.dataset.group;
    let current = header.nextElementSibling;

    header.classList.add("group-collapsed");

    while (current && !current.classList.contains("group-header")) {
      if (current.dataset.group === group) {
        current.style.display = "none";
      }
      current = current.nextElementSibling;
    }

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

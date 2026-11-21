import { fetchOrders } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { toggleSort, compareValues } from "../../core/sort.js";
import { formatSigned } from "../../core/format.js";
import { renderOrderSimulation } from "./orderSimulation.js";
import { createPairCombo } from "../../core/pairCombo.js";

let pairCombo = null; // filtro de par com busca
let loaded = false;

// filtros: par com busca e chips BUY/SELL (aplicam na hora)
export function initOrdersPanel() {
  const input = document.getElementById("ordersPairSearch");
  const list = document.getElementById("ordersPairList");
  if (input && list) {
    pairCombo = createPairCombo({
      input,
      list,
      getPairs: () => state.orders.map((o) => o.pair),
      isLoaded: () => loaded,
      onChange: applyOrderFilters,
    });
  }
  for (const id of ["ordersSideBuy", "ordersSideSell"]) {
    document.getElementById(id)?.addEventListener("change", applyOrderFilters);
  }
}

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
        state.orders.push({
          pair: order.symbol,
          side: order.side,
          type: order.type,
          quoteAsset: order.quoteAsset || "",
          price: Number(order.price) || Number(order.stopPrice) || 0,
          amount: Number(order.remainingQty ?? order.origQty),
          totalQuote: Number(order.totalQuote || 0),
          // total convertido para USDT (usado nos somatórios); null se a cotação não foi encontrada
          total: order.totalUSDT == null ? 0 : Number(order.totalUSDT),
          totalUnknown: order.totalUSDT == null,
          time: order.time,
          // % que o preço atual precisa andar até a ordem executar
          distancePct: order.distancePct ?? null,
          // valor de mercado hoje da quantidade em aberto (USDT)
          marketValueUSDT: order.marketValueUSDT ?? null,
        });
      });
    }
    loaded = true;
    pairCombo?.sync(); // par escolhido que não tem mais ordens (recarregou): volta para todos
    applyOrderFilters();
  } catch (e) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Erro: ${e}</td></tr>`;
    }
  }
}

export function applyOrderFilters() {
  const pair = pairCombo?.value() || "";
  const sides = new Set();
  if (document.getElementById("ordersSideBuy")?.checked !== false) sides.add("BUY");
  if (document.getElementById("ordersSideSell")?.checked !== false) sides.add("SELL");

  state.filteredOrders = state.orders.filter((o) => (pair === "" || o.pair === pair) && sides.has(o.side));

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
                <td colspan="5">${o.pair}</td>
                <td colspan="1">${pairTotal.formatCurrency()} USDT</td>
                <td colspan="1"></td>
            </tr>`;

      lastPair = o.pair;
    }

    const formattedDate = new Date(o.time).toLocaleString("pt-BR");
    const isUsdtQuote = o.quoteAsset === "USDT";
    const priceText = isUsdtQuote
      ? `${o.price.toFixed(5).formatCurrency()} USDT`
      : `${o.price.toFixed(8)} ${o.quoteAsset}`;
    const totalText = o.totalUnknown
      ? `-- <small>(${o.totalQuote.toFixed(8)} ${o.quoteAsset})</small>`
      : isUsdtQuote
        ? `${o.total.toFixed(2).formatCurrency()} USDT`
        : `${o.total.toFixed(2).formatCurrency()} USDT <small>(${o.totalQuote.toFixed(8)} ${o.quoteAsset})</small>`;

    tbody.innerHTML += `
        <tr data-group="${o.pair}">
          <td>${o.pair}</td>
          <td class="${o.side === "BUY" ? "buy" : "sell"}">${o.side}</td>
          <td>${priceText}</td>
          <td>${o.distancePct === null ? "--" : `${formatSigned(o.distancePct)}%`}</td>
          <td>${o.amount.toFixed(8)}</td>
          <td>${totalText}</td>
          <td>${formattedDate}</td>
        </tr>
      `;
  });

  // resumo do que está filtrado
  const countEl = document.getElementById("orders-count");
  const totalEl = document.getElementById("orders-total");
  if (countEl) countEl.textContent = state.filteredOrders.length.toLocaleString("pt-BR");
  if (totalEl) totalEl.textContent = `${total.toFixed(2).formatCurrency()} USDT`;

  if (!state.filteredOrders.length) {
    tbody.innerHTML =
      "<tr><td colspan='7'>Nenhuma ordem encontrada para os filtros.</td></tr>";
  }

  activateGroupAccordions();
  renderOrderSimulation();
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

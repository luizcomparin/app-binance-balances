import { fetchExecutedOrders } from "../../api/binance.js";
import { toggleSort, compareValues } from "../../core/sort.js";
import { formatPrice, formatQty } from "../../core/format.js";

const COLUMNS = 8;

const executed = {
  orders: [],
  filtered: [],
  sort: { key: "time", asc: false },
  loaded: false,
  loading: null,
};

// Carrega só quando a aba é aberta pela primeira vez (o histórico de trades é pesado)
export function initExecutedOrdersPanel() {
  const tab = document.querySelector('.tab[data-tab="executed"]');
  tab?.addEventListener("click", () => {
    if (!executed.loaded) loadExecutedOrders();
  });
}

export async function loadExecutedOrders() {
  if (executed.loading) return executed.loading;

  const tbody = document.getElementById("table-body-executed");
  const status = document.getElementById("executed-status");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="${COLUMNS}"><span class="inline-loading"><span class="mini-spinner"></span>Carregando histórico de trades... (a primeira carga pode levar alguns segundos)</span></td></tr>`;
  }

  executed.loading = fetchExecutedOrders()
    .then((data) => {
      executed.orders = data.orders || [];
      executed.loaded = true;
      createPairFilter();
      applyExecutedFilters();

      if (status) {
        const errorCount = data.errors?.length || 0;
        status.hidden = !errorCount;
        status.textContent = errorCount
          ? `${errorCount} par(es) falharam ao buscar trades.`
          : "";
      }
    })
    .catch((e) => {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${COLUMNS}" style="color:red;">Erro: ${e.message}</td></tr>`;
      }
    })
    .finally(() => {
      executed.loading = null;
    });

  return executed.loading;
}

function createPairFilter() {
  const select = document.getElementById("executedFilterPair");
  if (!select) return;

  const current = select.value;
  const pairs = [...new Set(executed.orders.map((o) => o.symbol))].sort();
  select.innerHTML =
    '<option value="">Todos</option>' +
    pairs.map((p) => `<option value="${p}">${p}</option>`).join("");
  if (pairs.includes(current)) select.value = current;
}

export function applyExecutedFilters() {
  const pair = document.getElementById("executedFilterPair")?.value || "";
  const side = document.getElementById("executedFilterSide")?.value || "ALL";

  executed.filtered = executed.orders.filter(
    (o) => (pair === "" || o.symbol === pair) && (side === "ALL" || o.side === side)
  );
  renderExecutedOrders();
}

export function sortExecutedOrders(key) {
  toggleSort(executed.sort, key);
  renderExecutedOrders();
}

function renderExecutedOrders() {
  const tbody = document.getElementById("table-body-executed");
  const totalDiv = document.getElementById("executed-total");
  if (!tbody) return;

  const { key, asc } = executed.sort;
  const rows = [...executed.filtered].sort((a, b) => compareValues(a[key], b[key], asc));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${COLUMNS}">Nenhuma ordem executada encontrada.</td></tr>`;
  } else {
    tbody.innerHTML = rows
      .map((o) => {
        const isUsdtQuote = o.quoteAsset === "USDT";
        return `
          <tr>
            <td>${new Date(o.time).toLocaleString("pt-BR")}</td>
            <td>${o.symbol}</td>
            <td class="${o.side === "BUY" ? "buy" : "sell"}">${o.side}</td>
            <td>${formatPrice(o.avgPrice)} ${o.quoteAsset}</td>
            <td>${formatQty(o.qty)}</td>
            <td>${isUsdtQuote ? o.quoteQty.toFixed(2).formatCurrency() : formatQty(o.quoteQty)} ${o.quoteAsset}</td>
            <td>${o.totalUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${formatPrice(o.feeUSDT)}</td>
          </tr>
        `;
      })
      .join("");
  }

  if (totalDiv) {
    const buys = rows.filter((o) => o.side === "BUY").reduce((acc, o) => acc + o.totalUSDT, 0);
    const sells = rows.filter((o) => o.side === "SELL").reduce((acc, o) => acc + o.totalUSDT, 0);
    totalDiv.innerHTML =
      `${rows.length} ordens · Compras: <b>${buys.toFixed(2).formatCurrency()} USDT</b>` +
      ` · Vendas: <b>${sells.toFixed(2).formatCurrency()} USDT</b>`;
  }
}

import { fetchExecutedOrders } from "../../api/binance.js";
import { toggleSort, compareValues } from "../../core/sort.js";
import { formatPrice, formatQty } from "../../core/format.js";
import { on, TAB_CHANGED } from "../../core/events.js";
import { createPairCombo } from "../../core/pairCombo.js";

const COLUMNS = 8;
let pairCombo = null; // filtro de par com busca

const executed = {
  orders: [],
  filtered: [],
  sort: { key: "time", asc: false },
  loaded: false,
  loading: null,
};

// Carrega só quando a aba é aberta pela primeira vez (o histórico de trades é pesado)
export function initExecutedOrdersPanel() {
  // ao entrar na aba por clique, pela URL (F5, link direto) ou Voltar/Avançar
  on(TAB_CHANGED, (tab) => {
    if (tab === "executed" && !executed.loaded) loadExecutedOrders();
  });
  const input = document.getElementById("executedPairSearch");
  const list = document.getElementById("executedPairList");
  if (input && list) {
    pairCombo = createPairCombo({
      input,
      list,
      getPairs: () => executed.orders.map((o) => o.symbol),
      isLoaded: () => executed.loaded,
      onChange: applyExecutedFilters,
    });
  }
  for (const id of ["executedSideBuy", "executedSideSell"]) {
    document.getElementById(id)?.addEventListener("change", applyExecutedFilters);
  }
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
      pairCombo?.sync(); // par escolhido que não existe mais (recarregou): volta para todos
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

export function applyExecutedFilters() {
  const pair = pairCombo?.value() || "";
  const sides = new Set();
  if (document.getElementById("executedSideBuy")?.checked !== false) sides.add("BUY");
  if (document.getElementById("executedSideSell")?.checked !== false) sides.add("SELL");

  executed.filtered = executed.orders.filter((o) => (pair === "" || o.symbol === pair) && sides.has(o.side));
  renderExecutedOrders();
}

export function sortExecutedOrders(key) {
  toggleSort(executed.sort, key);
  renderExecutedOrders();
}

function renderExecutedOrders() {
  const tbody = document.getElementById("table-body-executed");
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
            <td>${o.totalUSDT === null ? '<span title="Sem cotação para USDT na data">--</span>' : `${o.totalUSDT.toFixed(2).formatCurrency()} USDT`}</td>
            <td>${formatPrice(o.feeUSDT)}</td>
          </tr>
        `;
      })
      .join("");
  }

  // resumo do que está filtrado
  // ordens sem cotação (totalUSDT null) ficam fora dos somatórios
  const buys = rows.filter((o) => o.side === "BUY").reduce((acc, o) => acc + (o.totalUSDT ?? 0), 0);
  const sells = rows.filter((o) => o.side === "SELL").reduce((acc, o) => acc + (o.totalUSDT ?? 0), 0);
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("executed-count", rows.length.toLocaleString("pt-BR"));
  set("executed-buys", `${buys.toFixed(2).formatCurrency()} USDT`);
  set("executed-sells", `${sells.toFixed(2).formatCurrency()} USDT`);
}

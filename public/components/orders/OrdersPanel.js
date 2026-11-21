import { fetchOrders } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { toggleSort, compareValues } from "../../core/sort.js";
import { formatPrice, formatQty, formatSigned } from "../../core/format.js";
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
  renderOrders();
}

function calculateTotalsByPair(orders) {
  return orders.reduce((totals, order) => {
    totals[order.pair] = (totals[order.pair] || 0) + order.total;
    return totals;
  }, {});
}

// ---------------------------------------------------------------------------
// agrupamento por par: cada par vira uma linha-resumo (compras e vendas separadas) com as ordens dentro
// ---------------------------------------------------------------------------

const sum = (list, f) => list.reduce((acc, o) => acc + f(o), 0);
const withDistance = (list) => list.filter((o) => o.distancePct !== null);

function summarize(pair, orders) {
  const buys = orders.filter((o) => o.side === "BUY");
  const sells = orders.filter((o) => o.side === "SELL");
  const prices = orders.map((o) => o.price);
  // mais perto de executar: compra com a menor queda, venda com a menor alta
  const nearBuy = withDistance(buys).reduce((best, o) => (best === null || o.distancePct > best ? o.distancePct : best), null);
  const nearSell = withDistance(sells).reduce((best, o) => (best === null || o.distancePct < best ? o.distancePct : best), null);
  const nearest = Math.min(...[nearBuy, nearSell].filter((d) => d !== null).map(Math.abs), Infinity);
  return {
    pair,
    orders,
    quoteAsset: orders[0].quoteAsset,
    buys,
    sells,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    nearBuy,
    nearSell,
    nearest,
    buyQty: sum(buys, (o) => o.amount),
    sellQty: sum(sells, (o) => o.amount),
    buyTotal: sum(buys, (o) => o.total),
    sellTotal: sum(sells, (o) => o.total),
    total: sum(orders, (o) => o.total),
    latest: Math.max(...orders.map((o) => o.time)),
  };
}

// valor de cada par para ordenar pela coluna clicada; sem coluna: a ordem mais perto de executar primeiro
const GROUP_SORT = {
  pair: (g) => g.pair,
  side: (g) => g.orders.length,
  price: (g) => g.minPrice,
  distancePct: (g) => g.nearest,
  amount: (g) => g.buyQty + g.sellQty,
  total: (g) => g.total,
  time: (g) => g.latest,
};

function groupedOrders(orders) {
  const byPair = new Map();
  for (const o of orders) {
    if (!byPair.has(o.pair)) byPair.set(o.pair, []);
    byPair.get(o.pair).push(o);
  }
  const groups = [...byPair].map(([pair, list]) => summarize(pair, list));
  const { key, asc } = state.orderSort;
  const groupValue = GROUP_SORT[key] || GROUP_SORT.distancePct;
  const groupAsc = GROUP_SORT[key] ? asc : true;
  groups.sort((a, b) => compareValues(groupValue(a), groupValue(b), groupAsc) || compareValues(a.pair, b.pair, true));
  // ordens dentro do par: pela coluna clicada (sem coluna, na ordem em que vieram)
  if (key && key in GROUP_SORT && key !== "pair") {
    for (const g of groups) g.orders.sort((a, b) => compareValues(a[key], b[key], asc));
  }
  return groups;
}

// "compra · venda" com as cores do lado; um lado sem valor não aparece
function split(buyText, sellText) {
  const parts = [];
  if (buyText !== null) parts.push(`<span class="buy-soft">${buyText}</span>`);
  if (sellText !== null) parts.push(`<span class="sell-soft">${sellText}</span>`);
  return parts.length ? parts.join('<span class="grp-sep"> · </span>') : "--";
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pct = (v) => `${formatSigned(v)}%`;
const usdt = (v) => v.toFixed(2).formatCurrency();
const priceIn = (v, quote) => (quote === "USDT" ? formatPrice(v) : `${v.toFixed(8)} ${quote}`);

function groupRow(g) {
  const nb = g.buys.length;
  const ns = g.sells.length;
  const priceRange =
    g.minPrice === g.maxPrice
      ? priceIn(g.minPrice, g.quoteAsset)
      : `${priceIn(g.minPrice, g.quoteAsset)} – ${priceIn(g.maxPrice, g.quoteAsset)}`;
  return `
    <tr class="group-header" data-group="${g.pair}">
      <td><span class="grp-chevron" aria-hidden="true">▸</span>${g.pair}</td>
      <td>${split(nb ? plural(nb, "compra", "compras") : null, ns ? plural(ns, "venda", "vendas") : null)}</td>
      <td>${priceRange}</td>
      <td>${split(
        g.nearBuy === null ? null : `↓ ${pct(g.nearBuy)}`,
        g.nearSell === null ? null : `↑ ${pct(g.nearSell)}`
      )}</td>
      <td>${split(nb ? formatQty(g.buyQty) : null, ns ? formatQty(g.sellQty) : null)}</td>
      <td>${split(nb ? usdt(g.buyTotal) : null, ns ? usdt(g.sellTotal) : null)} <span class="grp-unit">USDT</span></td>
      <td class="grp-latest">${new Date(g.latest).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
    </tr>`;
}

function orderRow(o) {
  const formattedDate = new Date(o.time).toLocaleString("pt-BR");
  const isUsdtQuote = o.quoteAsset === "USDT";
  const priceText = isUsdtQuote ? `${o.price.toFixed(5).formatCurrency()} USDT` : `${o.price.toFixed(8)} ${o.quoteAsset}`;
  const totalText = o.totalUnknown
    ? `-- <small>(${o.totalQuote.toFixed(8)} ${o.quoteAsset})</small>`
    : isUsdtQuote
      ? `${o.total.toFixed(2).formatCurrency()} USDT`
      : `${o.total.toFixed(2).formatCurrency()} USDT <small>(${o.totalQuote.toFixed(8)} ${o.quoteAsset})</small>`;
  return `
    <tr data-group="${o.pair}">
      <td>${o.pair}</td>
      <td class="${o.side === "BUY" ? "buy" : "sell"}">${o.side}</td>
      <td>${priceText}</td>
      <td>${o.distancePct === null ? "--" : pct(o.distancePct)}</td>
      <td>${o.amount.toFixed(8)}</td>
      <td>${totalText}</td>
      <td class="nowrap">${formattedDate}</td>
    </tr>`;
}

function renderOrders() {
  const tbody = document.querySelector("#table-body-orders");
  if (!tbody) return;

  state.totalsByPair = calculateTotalsByPair(state.filteredOrders);
  const groups = groupedOrders(state.filteredOrders);

  tbody.innerHTML = groups.length
    ? groups.map((g) => groupRow(g) + g.orders.map(orderRow).join("")).join("")
    : "<tr><td colspan='7'>Nenhuma ordem encontrada para os filtros.</td></tr>";

  // resumo do que está filtrado: compras e vendas separadas (somar as duas não diz nada)
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("orders-count", state.filteredOrders.length.toLocaleString("pt-BR"));
  set("orders-buys", `${usdt(sum(groups, (g) => g.buyTotal))} USDT`);
  set("orders-sells", `${usdt(sum(groups, (g) => g.sellTotal))} USDT`);

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

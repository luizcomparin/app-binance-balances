// Aba "Histórico de ordens" abaixo do gráfico: ordens encerradas da moeda (executadas, canceladas,
// expiradas), no estilo da Binance — filtro de período, ordenação e linha expansível com as execuções.
import { fetchOrderHistory } from "../../api/binance.js";
import { formatDateTime, formatPrice, formatQty } from "../../core/format.js";
import { quoteAmount, triggerText, typeLabel } from "./openOrdersTable.js";
import { createPeriodFilter } from "./periodFilter.js";

const CACHE_MS = 60 * 1000;
const DEFAULT_PRESET = "90d"; // como na Binance: 3 meses

const STATUS_LABELS = {
  FILLED: "Executada",
  CANCELED: "Cancelada",
  PENDING_CANCEL: "Cancelando",
  EXPIRED: "Expirada",
  EXPIRED_IN_MATCH: "Expirada (prevenção de autonegociação)",
  REJECTED: "Rejeitada",
};

const SORTS = {
  time: (o) => o.time,
  type: (o) => typeLabel(o.type),
  side: (o) => o.side,
};

const hist = {
  els: null,
  asset: null,
  orders: undefined, // lista | undefined (carregando/não carregado) | null (erro)
  cache: new Map(), // asset -> { at, orders }
  period: null, // filtro de período (periodFilter.js)
  sort: { key: "time", dir: -1 },
  expanded: new Set(),
};

const dash = '<span class="muted">–</span>';
const statusLabel = (s) => STATUS_LABELS[s] || s;
const orderKey = (o) => `${o.symbol}:${o.orderId}`;
// sem nada executado e não "executada": cancelada/expirada sem execução → linha esmaecida
const isEmpty = (o) => !o.executedQty && o.status !== "FILLED";

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

function fillsHtml(o) {
  const head = `<div class="pco-detail-meta">
    <span>Status: <b>${statusLabel(o.status)}</b></span>
    <span>ID da ordem: ${o.orderId}</span>
    ${o.updateTime && o.updateTime !== o.time ? `<span>Atualizada em ${formatDateTime(o.updateTime)}</span>` : ""}
  </div>`;
  if (!o.fills.length) {
    return `${head}<p class="pco-empty">${o.executedQty ? "Execuções não encontradas no histórico de trades." : "Nenhuma execução."}</p>`;
  }
  const rows = o.fills
    .map(
      (f) => `<tr>
        <td class="pco-date">${formatDateTime(f.time)}</td>
        <td>${formatPrice(f.price)}</td>
        <td>${formatQty(f.qty)}</td>
        <td>${quoteAmount(f.quoteQty, o.quoteAsset)}</td>
        <td>${formatQty(f.commission)} ${f.commissionAsset}</td>
        <td>${f.isMaker ? "Maker" : "Taker"}</td>
      </tr>`
    )
    .join("");
  return `${head}<table class="pco-fills">
    <thead><tr><th>Data</th><th>Preço de negociação</th><th>Executado</th><th>Total</th><th>Taxa</th><th>Função</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function rowHtml(o) {
  const key = orderKey(o);
  const open = hist.expanded.has(key);
  const sideCls = o.side === "BUY" ? "buy" : "sell";
  const iso = o.orderListId !== undefined && o.orderListId !== -1 ? ' <span class="pco-tag">OCO</span>' : "";
  const row = `<tr class="pco-row${isEmpty(o) ? " pco-dim" : ""}${open ? " open" : ""}" data-key="${key}" title="${statusLabel(o.status)}">
    <td class="pco-expand"><span class="pco-caret">▾</span></td>
    <td class="pco-date">${formatDateTime(o.time)}</td>
    <td><b>${o.baseAsset}/${o.quoteAsset}</b></td>
    <td>${typeLabel(o.type)}${iso}</td>
    <td class="${sideCls}">${o.side === "BUY" ? "Compra" : "Venda"}</td>
    <td>${o.avgPrice ? formatPrice(o.avgPrice) : dash}</td>
    <td>${o.price ? formatPrice(o.price) : '<span class="muted">Mercado</span>'}</td>
    <td>${o.executedQty ? formatQty(o.executedQty) : dash}</td>
    <td>${formatQty(o.origQty)}</td>
    <td>${o.icebergQty ? formatQty(o.icebergQty) : dash}</td>
    <td>${o.quoteQty ? quoteAmount(o.quoteQty, o.quoteAsset) : dash}</td>
    <td>${triggerText(o)}</td>
  </tr>`;
  return open ? `${row}<tr class="pco-detail"><td colspan="12">${fillsHtml(o)}</td></tr>` : row;
}

function headerHtml() {
  const th = (label, key, title = "") => {
    if (!key) return `<th class="pco-nosort"${title ? ` title="${title}"` : ""}>${label}</th>`;
    const arrow = hist.sort.key === key ? (hist.sort.dir > 0 ? " ▲" : " ▼") : ' <span class="muted">⇅</span>';
    return `<th data-sort="${key}">${label}${arrow}</th>`;
  };
  return `<tr>
    <th class="pco-nosort pco-expand"></th>
    ${th("Data da ordem", "time")}${th("Par")}${th("Tipo", "type")}${th("Lado", "side")}
    ${th("Preço médio", null, "Preço médio das execuções")}${th("Preço")}${th("Executado")}${th("Quantidade")}
    ${th("Qtd. por ordem iceberg", null, "Parte visível no livro de ofertas (ordens iceberg)")}
    ${th("Total", null, "Valor executado, na moeda de cotação do par")}${th("Condições de gatilho")}
  </tr>`;
}

function render() {
  const el = hist.els?.list;
  if (!el) return;
  hist.period?.dataChanged();
  if (hist.orders === undefined) {
    el.innerHTML = '<p class="pco-empty"><span class="mini-spinner"></span> Carregando histórico de ordens...</p>';
    return;
  }
  if (hist.orders === null) {
    el.innerHTML = '<p class="pco-empty">Não foi possível carregar o histórico de ordens.</p>';
    return;
  }

  const inPeriod = hist.orders.filter((o) => hist.period.contains(o.time));
  if (!inPeriod.length) {
    el.innerHTML = `<p class="pco-empty">Nenhuma ordem de ${hist.asset} encerrada neste período.</p>`;
    return;
  }

  const get = SORTS[hist.sort.key];
  const rows = [...inPeriod].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    return (va < vb ? -1 : va > vb ? 1 : b.time - a.time) * (va === vb ? 1 : hist.sort.dir);
  });
  el.innerHTML = `<div class="table-wrapper pco-table"><table>
    <thead>${headerHtml()}</thead>
    <tbody>${rows.map(rowHtml).join("")}</tbody>
  </table></div>`;
}

// ---------------------------------------------------------------------------
// dados
// ---------------------------------------------------------------------------

async function load(asset) {
  const hit = hist.cache.get(asset);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    hist.orders = hit.orders;
    return render();
  }
  hist.orders = undefined;
  render();
  try {
    const data = await fetchOrderHistory(asset);
    hist.cache.set(asset, { at: Date.now(), orders: data.orders || [] });
    if (hist.asset !== asset) return;
    hist.orders = data.orders || [];
  } catch {
    if (hist.asset !== asset) return;
    hist.orders = null;
  }
  render();
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Liga filtros, ordenação e expansão. els = { pane, list, presets, from, to, search, reset } */
export function initOrderHistory(els) {
  hist.els = els;
  hist.period = createPeriodFilter(els, {
    defaultPreset: DEFAULT_PRESET,
    oldest: () => (Array.isArray(hist.orders) && hist.orders.length ? Math.min(...hist.orders.map((o) => o.time)) : null),
    onChange: render,
  });

  els.list.addEventListener("click", (e) => {
    const sortKey = e.target.closest("th[data-sort]")?.dataset.sort;
    if (sortKey) {
      hist.sort.dir = hist.sort.key === sortKey ? -hist.sort.dir : sortKey === "time" ? -1 : 1;
      hist.sort.key = sortKey;
      return render();
    }
    const row = e.target.closest("tr.pco-row");
    if (!row || window.getSelection()?.toString()) return; // não expande ao selecionar texto
    const key = row.dataset.key;
    if (hist.expanded.has(key)) hist.expanded.delete(key);
    else hist.expanded.add(key);
    render();
  });
}

/** Troca de moeda: limpa e, se a aba estiver visível, carrega já. */
export function setHistoryAsset(asset, visible) {
  if (hist.asset !== asset) {
    hist.asset = asset;
    hist.orders = undefined;
    hist.expanded.clear();
  }
  if (visible) showHistory();
}

/** A aba ficou visível: carrega (ou usa o cache) da moeda atual. */
export function showHistory() {
  if (!hist.asset) return;
  hist.period?.refresh();
  load(hist.asset);
}

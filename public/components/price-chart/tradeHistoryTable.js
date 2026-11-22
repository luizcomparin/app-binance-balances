// Aba "Histórico de trades" abaixo do gráfico: cada execução (fill) da moeda em todos os pares,
// no estilo da Binance — filtro de período, ordenação, taxa, maker/taker e total em USDT.
import { fetchAssetTrades } from "../../api/binance.js";
import { formatDateTime, formatPrice, formatQty } from "../../core/format.js";
import { quoteAmount } from "./openOrdersTable.js";
import { createPeriodFilter } from "./periodFilter.js";
import { loadErrorHtml, onLoadRetry } from "./loadError.js";

const CACHE_MS = 30 * 1000;
const DEFAULT_PRESET = "30d"; // como na Binance: 1 mês

const SORTS = {
  time: (t) => t.time,
  side: (t) => t.side,
  total: (t) => t.totalUSDT ?? 0,
};

const st = {
  el: null,
  asset: null,
  trades: undefined, // lista | undefined (carregando/não carregado) | null (erro)
  error: null, // mensagem do último erro de carga
  cache: new Map(), // asset -> { at, trades }
  period: null,
  sort: { key: "time", dir: -1 },
};

const dash = '<span class="muted">–</span>';

function rowHtml(t) {
  const sideCls = t.side === "BUY" ? "buy" : "sell";
  return `<tr>
    <td class="pco-mono">${t.orderId}</td>
    <td class="pco-date">${formatDateTime(t.time)}</td>
    <td><b>${t.baseAsset}/${t.quoteAsset}</b></td>
    <td class="${sideCls}">${t.side === "BUY" ? "Compra" : "Venda"}</td>
    <td>${formatPrice(t.price)}</td>
    <td>${formatQty(t.qty)}</td>
    <td>${formatQty(t.commission)} ${t.commissionAsset}</td>
    <td>${t.isMaker ? "Maker" : "Taker"}</td>
    <td>${quoteAmount(t.quoteQty, t.quoteAsset)}</td>
    <td>${t.totalUSDT === null ? dash : `≈ ${t.totalUSDT.toFixed(2).formatCurrency()} USDT`}</td>
  </tr>`;
}

function headerHtml() {
  const th = (label, key, title = "") => {
    if (!key) return `<th class="pco-nosort"${title ? ` title="${title}"` : ""}>${label}</th>`;
    const arrow = st.sort.key === key ? (st.sort.dir > 0 ? " ▲" : " ▼") : ' <span class="muted">⇅</span>';
    return `<th data-sort="${key}"${title ? ` title="${title}"` : ""}>${label}${arrow}</th>`;
  };
  return `<tr>
    ${th("Nº da ordem")}${th("Data", "time")}${th("Par")}${th("Lado", "side")}${th("Preço")}${th("Executado")}
    ${th("Taxa")}${th("Função", null, "Maker: sua ordem estava no livro e foi executada por outra (taxa menor). Taker: sua ordem executou contra uma que já estava no livro.")}
    ${th("Total", null, "Valor do trade, na moeda de cotação do par")}${th("Total em USDT", "total", "Convertido pela cotação do dia do trade")}
  </tr>`;
}

function render() {
  const el = st.el;
  if (!el) return;
  st.period?.dataChanged();
  if (st.trades === undefined) {
    el.innerHTML = '<p class="pco-empty"><span class="mini-spinner"></span> Carregando histórico de trades...</p>';
    return;
  }
  if (st.trades === null) {
    el.innerHTML = loadErrorHtml("o histórico de trades", st.error);
    return;
  }

  const inPeriod = st.trades.filter((t) => st.period.contains(t.time));
  if (!inPeriod.length) {
    el.innerHTML = `<p class="pco-empty">Nenhum trade de ${st.asset} neste período.</p>`;
    return;
  }

  const get = SORTS[st.sort.key];
  const rows = [...inPeriod].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    return (va < vb ? -1 : va > vb ? 1 : b.time - a.time) * (va === vb ? 1 : st.sort.dir);
  });
  el.innerHTML = `<div class="table-wrapper pco-table"><table>
    <thead>${headerHtml()}</thead>
    <tbody>${rows.map(rowHtml).join("")}</tbody>
  </table></div>`;
}

async function load(asset) {
  const hit = st.cache.get(asset);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    st.trades = hit.trades;
    return render();
  }
  st.trades = undefined;
  st.error = null;
  render();
  try {
    const data = await fetchAssetTrades(asset);
    st.cache.set(asset, { at: Date.now(), trades: data.trades || [] });
    if (st.asset !== asset) return;
    st.trades = data.trades || [];
  } catch (err) {
    if (st.asset !== asset) return;
    st.trades = null;
    st.error = err?.message || null;
  }
  render();
}

/** Liga filtro e ordenação. els = { list, presets, from, to, search, reset } */
export function initTradeHistory(els) {
  st.el = els.list;
  st.period = createPeriodFilter(els, {
    defaultPreset: DEFAULT_PRESET,
    oldest: () => (Array.isArray(st.trades) && st.trades.length ? Math.min(...st.trades.map((t) => t.time)) : null),
    // o filtro de período é local (a lista vem inteira); se a última carga falhou, Buscar tenta de novo
    onChange: () => (st.trades === null && st.asset ? load(st.asset) : render()),
  });
  onLoadRetry(els.list, () => st.asset && load(st.asset));
  els.list.addEventListener("click", (e) => {
    const key = e.target.closest("th[data-sort]")?.dataset.sort;
    if (!key) return;
    st.sort.dir = st.sort.key === key ? -st.sort.dir : key === "time" ? -1 : 1;
    st.sort.key = key;
    render();
  });
}

/** Troca de moeda: limpa e, se a aba estiver visível, carrega já. */
export function setTradesAsset(asset, visible) {
  if (st.asset !== asset) {
    st.asset = asset;
    st.trades = undefined;
  }
  if (visible) showTrades();
}

/** Botão Atualizar do topo: descarta o cache da moeda atual e, se a aba estiver visível, busca de novo. */
export function reloadTrades(visible) {
  if (!st.asset) return Promise.resolve();
  st.cache.delete(st.asset);
  return visible ? load(st.asset) : Promise.resolve();
}

/** A aba ficou visível: carrega (ou usa o cache) da moeda atual. */
export function showTrades() {
  if (!st.asset) return;
  st.period?.refresh();
  load(st.asset);
}

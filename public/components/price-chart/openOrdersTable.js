// Aba "Ordens abertas" abaixo do gráfico: as ordens em aberto da moeda, no estilo da tabela da Binance.
import { formatDateTime, formatPrice, formatQty } from "../../core/format.js";

const TYPE_LABELS = {
  LIMIT: "Limite",
  LIMIT_MAKER: "Limite Maker",
  MARKET: "Mercado",
  STOP_LOSS: "Stop Loss",
  STOP_LOSS_LIMIT: "Stop Limite",
  TAKE_PROFIT: "Take Profit",
  TAKE_PROFIT_LIMIT: "Take Profit Limite",
};

// colunas: chave de ordenação (null = sem ordenação) e valor usado para ordenar
const SORTS = {
  time: (o) => o.time,
  type: (o) => typeLabel(o.type),
  side: (o) => o.side,
  price: (o) => priceOf(o) * (Number(o.quotePriceUSDT) || 1),
};

const sort = { key: "time", dir: -1 }; // padrão: mais recentes primeiro
let last = { el: null, orders: null, asset: null };

export const typeLabel = (type) => TYPE_LABELS[type] || String(type || "--").replace(/_/g, " ");
const priceOf = (o) => Number(o.price) || 0;
const isStable = (quote) => ["USDT", "FDUSD", "USDC", "BRL"].includes(quote);
const dash = '<span class="muted">–</span>';

// "Último preço <= 0,119": stop loss dispara contra o lado da ordem, take profit a favor
export function triggerText(o) {
  const stop = Number(o.stopPrice);
  if (!stop) return dash;
  const isStop = String(o.type).startsWith("STOP_LOSS");
  const down = (o.side === "SELL") === isStop; // venda com stop ou compra com take profit: dispara na queda
  return `Último preço ${down ? "&lt;=" : "&gt;="} ${formatPrice(stop)}`;
}

export function quoteAmount(v, quote) {
  return `${isStable(quote) ? v.toFixed(2).formatCurrency() : formatPrice(v)} ${quote}`;
}

function rowHtml(o) {
  const quote = o.quoteAsset || "";
  const price = priceOf(o);
  const orig = Number(o.origQty) || 0;
  const filled = orig ? (Number(o.executedQty) / orig) * 100 : 0;
  const iceberg = Number(o.icebergQty);
  const sideCls = o.side === "BUY" ? "buy" : "sell";
  // Total como na Binance: preço × quantidade original; ordens a mercado (stop/take profit) usam o gatilho
  const totalPrice = price || Number(o.stopPrice) || 0;
  return `<tr>
    <td class="pco-date">${formatDateTime(o.time)}</td>
    <td><b>${o.baseAsset}/${quote}</b></td>
    <td>${typeLabel(o.type)}${o.orderListId !== undefined && o.orderListId !== -1 ? ' <span class="pco-tag">OCO</span>' : ""}</td>
    <td class="${sideCls}">${o.side === "BUY" ? "Compra" : "Venda"}</td>
    <td>${price ? formatPrice(price) : '<span class="muted">Mercado</span>'}</td>
    <td>${formatQty(orig)}</td>
    <td>${iceberg ? formatQty(iceberg) : dash}</td>
    <td>${filled.toFixed(filled && filled < 1 ? 2 : 0).replace(".", ",")}%</td>
    <td>${totalPrice ? quoteAmount(totalPrice * orig, quote) : dash}</td>
    <td>${triggerText(o)}</td>
  </tr>`;
}

function headerHtml() {
  const th = (label, key, title = "") => {
    if (!key) return `<th class="pco-nosort"${title ? ` title="${title}"` : ""}>${label}</th>`;
    const arrow = sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ' <span class="muted">⇅</span>';
    return `<th data-sort="${key}">${label}${arrow}</th>`;
  };
  return `<tr>
    ${th("Data", "time")}${th("Par")}${th("Tipo", "type")}${th("Lado", "side")}${th("Preço", "price")}
    ${th("Quantidade")}${th("Qtd. por ordem iceberg", null, "Parte visível no livro de ofertas (ordens iceberg)")}
    ${th("Executado")}${th("Total", null, "Preço × quantidade, na moeda de cotação do par")}${th("Condições de gatilho")}
  </tr>`;
}

/**
 * Desenha a tabela em `el` e o total no rótulo da aba (`countEl`). orders: lista crua de
 * /orders/:asset (com baseAsset/quoteAsset), undefined = carregando, null = erro.
 */
export function renderOpenOrdersTable(el, orders, asset, countEl) {
  if (!el) return;
  last = { el, orders, asset, countEl };
  if (countEl) countEl.textContent = Array.isArray(orders) ? `(${orders.length})` : "";
  const title = "";

  if (orders === undefined) {
    el.innerHTML = `${title}<p class="pco-empty"><span class="mini-spinner"></span> Carregando ordens abertas...</p>`;
    return;
  }
  if (orders === null) {
    el.innerHTML = `${title}<p class="pco-empty">Não foi possível carregar as ordens abertas.</p>`;
    return;
  }
  if (!orders.length) {
    el.innerHTML = `${title}<p class="pco-empty">Nenhuma ordem aberta para ${asset}.</p>`;
    return;
  }

  const get = SORTS[sort.key];
  const rows = [...orders].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });
  el.innerHTML = `${title}<div class="table-wrapper pco-table"><table>
    <thead>${headerHtml()}</thead>
    <tbody>${rows.map(rowHtml).join("")}</tbody>
  </table></div>`;
}

// clique no cabeçalho ordena (de novo na mesma coluna inverte)
export function initOpenOrdersTable(el) {
  el?.addEventListener("click", (e) => {
    const key = e.target.closest("th[data-sort]")?.dataset.sort;
    if (!key) return;
    sort.dir = sort.key === key ? -sort.dir : key === "time" ? -1 : 1;
    sort.key = key;
    if (last.el) renderOpenOrdersTable(last.el, last.orders, last.asset, last.countEl);
  });
}

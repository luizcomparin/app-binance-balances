// Tooltip HTML sobre o gráfico: vela sob o mouse, detalhes de uma ordem sua ou caixa do simulador.
import { formatDateTime, formatPct, formatPrice, formatQty } from "../../../core/format.js";

import { escapeHtml } from "../../../core/dom.js";
import { quoteOf } from "../chartQuote.js";
const lines = (arr) => arr.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
const sideClass = (o) => (o.side === "BUY" ? "buy" : "sell");
const sideTitle = (o) => `${o.side === "BUY" ? "Compra" : "Venda"} · ${formatDateTime(o.time)}`;

// Elemento do tooltip dentro de `wrap`, posicionado ao lado do mouse sem sair do gráfico
export function createTooltip(wrap, container) {
  const tip = document.createElement("div");
  tip.className = "lwc-tooltip";
  tip.hidden = true;
  wrap.appendChild(tip);

  return {
    show(point, html, cls = "") {
      tip.className = `lwc-tooltip ${cls}`;
      tip.innerHTML = html;
      tip.hidden = false;
      const pad = 14;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let x = point.x + pad;
      if (x + w > container.clientWidth - 60) x = point.x - pad - w; // 60 ≈ eixo de preço
      let y = point.y + pad;
      if (y + h > container.clientHeight) y = point.y - pad - h;
      tip.style.left = `${Math.max(0, x)}px`;
      tip.style.top = `${Math.max(0, y)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

// total da ordem na cotação do gráfico (m.y = preço na cotação do gráfico)
const chartTotal = (m) => `${(m.y * m.order.qty).toFixed(2).formatCurrency()} ${quoteOf(m.order.baseAsset)}`;

// Linhas de detalhe de uma ordem sua (hover no marcador)
function orderDetails(m, currentPrice) {
  const o = m.order;
  const quote = quoteOf(o.baseAsset); // cotação do gráfico (USDT; BRL no USDT/BRL)
  const out = [`Par: ${o.baseAsset}/${o.quoteAsset}`, `Quantidade: ${formatQty(o.qty)} ${o.baseAsset}`];
  if (o.quoteAsset !== quote) {
    out.push(`Preço: ${formatPrice(o.avgPrice)} ${o.quoteAsset} (≈ ${formatPrice(m.y)} ${quote})`);
    out.push(`Total: ${formatPrice(o.quoteQty)} ${o.quoteAsset} (≈ ${chartTotal(m)})`);
  } else {
    out.push(`Preço: ${formatPrice(m.y)} ${quote}`);
    out.push(`Total: ${chartTotal(m)}`);
  }
  if (o.feeUSDT) out.push(`Taxa: ≈ ${formatPrice(o.feeUSDT)} USDT`);
  if (o.fills > 1) out.push(`Executada em ${o.fills} partes`);

  if (currentPrice) {
    const diff = ((currentPrice - m.y) / m.y) * 100;
    if (o.side === "BUY") {
      // quanto essa compra vale hoje
      out.push(`Hoje: ${formatPct(diff)} (${(o.qty * currentPrice).toFixed(2).formatCurrency()} ${quote})`);
    } else {
      // se não tivesse vendido: positivo = vendeu cedo demais, negativo = vendeu bem
      out.push(`Preço atual vs. venda: ${formatPct(diff)}`);
    }
  }
  return out;
}

function orderSummary(m) {
  const o = m.order;
  return `${o.side === "BUY" ? "Compra" : "Venda"} ${formatDateTime(o.time)}: ${formatQty(o.qty)} ${o.baseAsset} a ${formatPrice(m.y)} (${chartTotal(m)})`;
}

// Uma ou mais ordens suas sob o mouse
export function ordersTooltipHtml(hovered, currentPrice) {
  return hovered
    .map((m) => `<div class="tt-title ${sideClass(m.order)}">${escapeHtml(sideTitle(m.order))}</div>${lines(orderDetails(m, currentPrice))}`)
    .join('<div class="tt-sep"></div>');
}

// Vela/ponto sob o mouse, com o resumo das suas ordens daquela vela
// quote: moeda de cotação do gráfico
export function candleTooltipHtml(title, p, candle, ordersAtCandle, quote = "USDT") {
  const body = [];
  if (candle) {
    const chg = p.open ? ((p.close - p.open) / p.open) * 100 : 0;
    body.push(`Abertura: ${formatPrice(p.open)}`, `Máxima: ${formatPrice(p.high)}`, `Mínima: ${formatPrice(p.low)}`);
    body.push(`Fechamento: ${formatPrice(p.close)} (${formatPct(chg)})`);
  } else {
    body.push(`Preço: ${formatPrice(p.close)} ${quote}`);
  }
  let html = `<div class="tt-title">${escapeHtml(title)}</div>${lines(body)}`;
  if (ordersAtCandle.length) {
    html += `<div class="tt-sep"></div>${ordersAtCandle.map((m) => `<div class="${sideClass(m.order)}">● ${escapeHtml(orderSummary(m))}</div>`).join("")}`;
  }
  return html;
}

// Explicação de uma linha de preço (hover na etiqueta da linha)
export function lineHelpTooltipHtml(help) {
  return `<div class="tt-title">${escapeHtml(help.title)}</div><div>${escapeHtml(help.text)}</div>`;
}

// Caixa do simulador: box = { lines, status } (ver buySimulator.simBox)
export function simTooltipHtml(box) {
  return `<div class="tt-sim-title">${escapeHtml(box.lines[0])}</div>${lines(box.lines.slice(1))}`;
}

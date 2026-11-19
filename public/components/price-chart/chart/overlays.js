// O que vai por cima das velas: preço médio, ordens abertas (linhas no eixo),
// suas ordens executadas (marcadores no preço exato) e o resumo das ordens fora da tela.
import { formatPrice, formatQty } from "../../../core/format.js";
import { toChartTime } from "./axis.js";

const LWC = window.LightweightCharts;

export const COLORS = {
  up: "#52ffa8",
  down: "#ff7272",
  line: "#4dd4ff",
  avg: "rgba(247, 147, 26, 0.95)",
  projected: "rgba(196, 140, 255, 0.95)",
  openBuy: "rgba(82, 255, 168, 0.6)",
  openSell: "rgba(255, 114, 114, 0.6)",
};

// Etiqueta da linha de ordem aberta: "V 0,00033 · 49,30 USDT" (total na moeda de cotação do par)
function openOrderTitle(prefix, it) {
  const quote = it.order.quoteAsset || "USDT";
  const total = Number(it.order.totalQuote) || it.qty * (Number(it.order.price) || Number(it.order.stopPrice) || 0);
  const totalText = ["USDT", "FDUSD", "USDC", "BRL"].includes(quote) ? total.toFixed(2).formatCurrency() : formatPrice(total);
  return `${prefix} ${formatQty(it.qty)} · ${totalText} ${quote}`;
}

/**
 * Recria as linhas de preço da série (remove as anteriores) e devolve as novas.
 * opts = { avg, projectedAvg, openOrders }   hidden = { openBuys, openSells }
 */
export function drawPriceLines(series, previousLines, { avg, projectedAvg, openOrders }, hidden) {
  for (const line of previousLines) series.removePriceLine(line);
  const lines = [];
  const add = (o) => lines.push(series.createPriceLine({ axisLabelVisible: true, ...o }));

  if (avg) add({ price: avg, color: COLORS.avg, lineWidth: 2, lineStyle: LWC.LineStyle.Dashed, title: "Preço médio" });
  if (projectedAvg) {
    add({
      price: projectedAvg,
      color: COLORS.projected,
      lineWidth: 2,
      lineStyle: LWC.LineStyle.LargeDashed,
      title: "Médio após compras",
    });
  }
  if (openOrders && !hidden.openBuys) {
    for (const it of openOrders.buys) {
      add({ price: it.priceUSDT, color: COLORS.openBuy, lineWidth: 1, lineStyle: LWC.LineStyle.Dotted, title: openOrderTitle("C", it) });
    }
  }
  if (openOrders && !hidden.openSells) {
    for (const it of openOrders.sells) {
      add({ price: it.priceUSDT, color: COLORS.openSell, lineWidth: 1, lineStyle: LWC.LineStyle.Dotted, title: openOrderTitle("V", it) });
    }
  }
  return lines;
}

// Suas ordens executadas visíveis (respeita o liga/desliga da legenda)
export function visibleMyOrders(orders, hidden) {
  return [...(hidden.myBuys ? [] : orders.buys), ...(hidden.mySells ? [] : orders.sells)];
}

// Marcadores (bolinhas) das suas ordens, no preço exato de execução
export function buildMarkers(myOrders, points, interval) {
  const markers = [];
  for (const m of myOrders) {
    const p = points[m.idx];
    if (!p) continue;
    markers.push({
      time: toChartTime(p.time, interval),
      position: "atPriceMiddle",
      price: m.y,
      color: m.order.side === "BUY" ? COLORS.up : COLORS.down,
      shape: "circle",
      size: 1,
    });
  }
  return markers.sort((a, b) => a.time - b.time);
}

/**
 * Textos do resumo das ordens abertas fora da faixa de preço visível [bottom, top]:
 * { above: "↑ 3 vendas acima", below: "↓ 1 compra abaixo" } (strings vazias se nada fora).
 */
export function offscreenSummary(openOrders, hidden, top, bottom) {
  const above = { BUY: 0, SELL: 0 };
  const below = { BUY: 0, SELL: 0 };
  const count = (list, side) => {
    for (const it of list) {
      if (top !== null && it.priceUSDT > top) above[side]++;
      else if (bottom !== null && it.priceUSDT < bottom) below[side]++;
    }
  };
  if (!hidden.openBuys) count(openOrders.buys, "BUY");
  if (!hidden.openSells) count(openOrders.sells, "SELL");

  const text = (c, dir, where) =>
    [
      c.SELL ? `${c.SELL} venda${c.SELL > 1 ? "s" : ""}` : null,
      c.BUY ? `${c.BUY} compra${c.BUY > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .map((t) => `${dir} ${t}`)
      .join(" · ") + (c.SELL || c.BUY ? ` ${where}` : "");

  return { above: text(above, "↑", "acima"), below: text(below, "↓", "abaixo") };
}

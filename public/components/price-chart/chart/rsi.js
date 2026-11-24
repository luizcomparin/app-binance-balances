// RSI (Índice de Força Relativa) sobre o fechamento, como no TradingView: médias de altas e de baixas
// com a suavização de Wilder (RMA), começando pela média simples das primeiras `period` variações.
//   RSI = 100 − 100 / (1 + média das altas / média das baixas)   (sem baixas no período: 100; sem altas: 0)

import { movingAverage } from "./movingAverage.js";

export const RSI_DEFAULT = {
  period: 14,
  overbought: 70,
  oversold: 30,
  color: "#a78bfa",
  opacity: 1,
  // média móvel do RSI (desligada por padrão, como no TradingView)
  maOn: false,
  maType: "SMA",
  maPeriod: 14,
  maColor: "#ffd166",
  // aparência das linhas de sobrecompra e sobrevenda (e da linha do meio, em 50)
  overboughtColor: "#ff7272",
  oversoldColor: "#52ffa8",
  lineStyle: "dashed",
  lineWidth: 1,
  levelOpacity: 0.6,
  showMid: true,
};

export const RSI_LINE_STYLES = ["solid", "dashed", "dotted"];

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const opacity = (v, fallback) => {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? Math.min(1, Math.max(0.05, n)) : fallback;
};

/**
 * Configurações do painel do RSI dentro dos limites: período 2–100, sobrecompra 51–99, sobrevenda 1–49,
 * cores "#rrggbb", opacidades 5–100%, média móvel SMA/EMA de 2–100, linhas sólida/tracejada/pontilhada
 * de 1–4 px. Valores inválidos voltam ao padrão.
 */
export function normalizeRsiSettings(c) {
  const d = RSI_DEFAULT;
  return {
    period: clampInt(c?.period, 2, 100, d.period),
    overbought: clampInt(c?.overbought, 51, 99, d.overbought),
    oversold: clampInt(c?.oversold, 1, 49, d.oversold),
    color: hex(c?.color, d.color),
    opacity: opacity(c?.opacity, d.opacity),
    maOn: c?.maOn === true,
    maType: c?.maType === "EMA" ? "EMA" : "SMA",
    maPeriod: clampInt(c?.maPeriod, 2, 100, d.maPeriod),
    maColor: hex(c?.maColor, d.maColor),
    overboughtColor: hex(c?.overboughtColor, d.overboughtColor),
    oversoldColor: hex(c?.oversoldColor, d.oversoldColor),
    lineStyle: RSI_LINE_STYLES.includes(c?.lineStyle) ? c.lineStyle : d.lineStyle,
    lineWidth: clampInt(c?.lineWidth, 1, 4, d.lineWidth),
    levelOpacity: opacity(c?.levelOpacity, d.levelOpacity),
    showMid: c?.showMid !== false,
  };
}

/**
 * Média móvel (SMA/EMA) dos valores do RSI, alinhada a eles: começa depois do aquecimento do RSI
 * (os null do início) e fica null até haver `period` valores.
 */
export function rsiMovingAverage(values, period, type = "SMA") {
  const out = new Array(values?.length || 0).fill(null);
  const first = out.length ? values.findIndex((v) => v !== null) : -1;
  if (first < 0) return out;
  const tail = movingAverage(values.slice(first).map((v) => ({ v })), period, type, "v");
  tail.forEach((v, i) => (out[first + i] = v));
  return out;
}

/** points = velas ({ close }); devolve o RSI alinhado às velas, com null nas primeiras `period` (aquecimento) */
export function rsi(points, period) {
  const n = points?.length || 0;
  const out = new Array(n).fill(null);
  if (!(period >= 1) || n <= period) return out;
  const value = (up, down) => (down === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / down));
  let up = 0;
  let down = 0;
  for (let i = 1; i <= period; i++) {
    const d = points[i].close - points[i - 1].close;
    up += Math.max(d, 0);
    down += Math.max(-d, 0);
  }
  up /= period;
  down /= period;
  out[period] = value(up, down);
  for (let i = period + 1; i < n; i++) {
    const d = points[i].close - points[i - 1].close;
    up = (up * (period - 1) + Math.max(d, 0)) / period;
    down = (down * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value(up, down);
  }
  return out;
}

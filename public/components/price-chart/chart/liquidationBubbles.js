// Bolhas das liquidações REAIS sobre o gráfico ("primitive" do Lightweight Charts), com os dados de
// /liquidations (Coinalyze) da vela atual: uma bolha por vela e por lado, do tamanho do valor liquidado.
//   - longs liquidados (vendas forçadas): vermelho, na MÍNIMA da vela (o preço caiu até eles);
//   - shorts liquidados (compras forçadas): verde, na MÁXIMA da vela.
// A Coinalyze não diz o preço de cada liquidação, só quanto foi liquidado no período: a posição vertical
// é aproximada (o extremo da vela). Serve para ver se as faixas do mapa estimado "pegaram" as cascatas.
import { formatUsdShort } from "../../../core/format.js";

export const BUBBLE_SOURCES = ["all", "binance"]; // 3 corretoras somadas | só Binance
const BINANCE = "Binance";
const COLORS = {
  long: [255, 114, 114], // mesmas cores do painel de liquidações (futuresPanes.COLORS.liqLong / liqShort)
  short: [82, 255, 168],
};
const MIN_RADIUS = 2.5; // px (CSS)
const MAX_RADIUS = 18;
const MIN_SHARE = 0.03; // bolhas menores que 3% da escala não são desenhadas (poluem sem informar)
const LABELS = 3; // rótulos de valor nas maiores bolhas visíveis

// índice da vela que contém o instante t (última vela com time <= t); -1 se antes do gráfico
function barIndex(points, t) {
  if (!points.length || t < points[0].time) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Bolhas por vela: [{ index, side: "long" | "short", price, usd }].
 * points = velas do gráfico ({ time, high, low }); rows = /liquidations ({ t, long, short, by });
 * source = "all" (soma das corretoras) ou "binance" (só by.Binance). Vela sem liquidação não gera bolha.
 */
export function liquidationBubbles(points, rows, source = "all") {
  if (!points?.length || !rows?.length) return [];
  const long = new Array(points.length).fill(0);
  const short = new Array(points.length).fill(0);
  for (const row of rows) {
    const i = barIndex(points, row.t);
    if (i < 0) continue;
    const v = source === "binance" ? row.by?.[BINANCE] : row;
    if (!v) continue;
    long[i] += Number(v.long) || 0;
    short[i] += Number(v.short) || 0;
  }
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (long[i] > 0) out.push({ index: i, side: "long", price: points[i].low, usd: long[i] });
    if (short[i] > 0) out.push({ index: i, side: "short", price: points[i].high, usd: short[i] });
  }
  return out;
}

/** Escala das bolhas: percentil 98 dos valores (uma liquidação gigante não encolhe todas as outras) */
export function bubbleScale(bubbles) {
  if (!bubbles.length) return 1;
  const sorted = bubbles.map((b) => b.usd).sort((a, b) => a - b);
  return Math.max(1, sorted[Math.floor(sorted.length * 0.98)] || sorted.at(-1));
}

/**
 * Bolhas a desenhar com o limite mínimo (US$) escolhido: { list, scale }. A escala vem de TODAS as bolhas,
 * para o tamanho de cada uma não mudar quando o limite esconde as menores.
 */
export function bubblesAbove(bubbles, minUsd = 0) {
  if (!bubbles?.length) return { list: [], scale: 1 };
  return { list: minUsd > 0 ? bubbles.filter((b) => b.usd >= minUsd) : bubbles, scale: bubbleScale(bubbles) };
}

const UNITS = { "": 1, k: 1e3, mil: 1e3, m: 1e6, mi: 1e6, b: 1e9, bi: 1e9 };

/**
 * Valor em US$ digitado no limite das bolhas: "5M", "1,5 mi", "500k", "2B", "300000" (vazio = 0).
 * Texto inválido → null.
 */
export function parseUsdAmount(text) {
  const t = String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/^us\$|^\$/, "")
    .replace(/\s+/g, "");
  if (!t) return 0;
  const m = t.match(/^(\d+(?:[.,]\d+)?)(k|mil|m|mi|b|bi)?$/);
  if (!m) return null;
  return Number(m[1].replace(",", ".")) * UNITS[m[2] || ""];
}

/** Raio (px CSS) de uma bolha, proporcional à raiz do valor (área ∝ valor); null = pequena demais */
export function bubbleRadius(usd, scale) {
  const share = Math.min(1, usd / scale);
  if (share < MIN_SHARE) return null;
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(share);
}

export class LiquidationBubbles {
  constructor() {
    this._bubbles = null;
    this._scale = 1;
    const self = this;
    this._view = {
      zOrder: () => "normal",
      renderer: () => ({ draw: (target) => self._draw(target) }),
    };
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = this._series = this._requestUpdate = null;
  }

  /** bubbles = resultado de liquidationBubbles() ou null para esconder; minUsd = só as bolhas a partir desse valor */
  setData(bubbles, minUsd = 0) {
    if (!bubbles?.length && !this._bubbles?.length) return;
    const { list, scale } = bubblesAbove(bubbles, minUsd);
    this._bubbles = list.length ? list : null;
    this._scale = scale;
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return [this._view];
  }

  _draw(target) {
    const bubbles = this._bubbles;
    if (!bubbles || !this._chart || !this._series) return;
    const ts = this._chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const visible = [];
      for (const b of bubbles) {
        if (b.index < range.from - 1 || b.index > range.to + 1) continue;
        const r = bubbleRadius(b.usd, this._scale);
        if (r === null) continue;
        const x = ts.logicalToCoordinate(b.index);
        const y = this._series.priceToCoordinate(b.price);
        if (x === null || y === null) continue;
        visible.push({ ...b, x: x * hr, y: y * vr, r: r * hr });
      }
      // maiores primeiro: as pequenas ficam por cima e continuam visíveis
      visible.sort((a, b) => b.usd - a.usd);
      for (const b of visible) {
        const [cr, cg, cb] = COLORS[b.side];
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.28)`;
        ctx.fill();
        ctx.lineWidth = Math.max(1, hr);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.85)`;
        ctx.stroke();
      }

      // valor das maiores bolhas visíveis
      ctx.font = `${Math.round(11 * vr)}px Manrope, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (const b of visible.slice(0, LABELS)) {
        const text = formatUsdShort(b.usd);
        const tw = ctx.measureText(text).width;
        const x = Math.min(b.x + b.r + 4 * hr, bitmapSize.width - tw - 8 * hr);
        ctx.fillStyle = "rgba(11, 16, 36, 0.8)";
        ctx.fillRect(x - 3 * hr, b.y - 8 * vr, tw + 6 * hr, 16 * vr);
        ctx.fillStyle = `rgb(${COLORS[b.side].join(", ")})`;
        ctx.fillText(text, x, b.y);
      }
    });
  }
}

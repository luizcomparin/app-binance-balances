// Liquidações REAIS desenhadas sobre o gráfico ("primitive" do Lightweight Charts), com os dados de
// /liquidations (Coinalyze). Três estilos (opção "Estilo" da engrenagem):
//   - "profile" (padrão): perfil por preço na borda esquerda — o valor liquidado de cada período é
//     espalhado na faixa de preço que ele percorreu (longs entre a abertura e a mínima, shorts entre a
//     abertura e a máxima) e somado por faixa de preço, só com as velas visíveis;
//   - "bubbles": uma bolha por vela e por lado, do tamanho do valor (longs em vermelho, shorts em verde);
//   - "top": só as N maiores liquidações visíveis, com uma linha até a borda direita e o valor e o preço.
// A Coinalyze não diz o preço de cada liquidação, só quanto foi liquidado no período. Para chegar mais
// perto, cada HORA é posicionada pela vela de 1h dela (mínima para longs, máxima para shorts) e a bolha
// de uma vela maior fica na média desses preços, ponderada pelo valor. Antes do início do histórico
// horário (a Coinalyze guarda ~83 dias de 1h), usa a vela do próprio gráfico.
import { formatPrice, formatUsdShort } from "../../../core/format.js";

export const BUBBLE_SOURCES = ["all", "binance"]; // 3 corretoras somadas | só Binance
export const LIQ_STYLES = ["profile", "bubbles", "top"];
export const TOP_COUNTS = [3, 5, 10];
const BINANCE = "Binance";
const COLORS = {
  long: [255, 114, 114], // mesmas cores do painel de liquidações (futuresPanes.COLORS.liqLong / liqShort)
  short: [82, 255, 168],
};
const MIN_RADIUS = 2.5; // px (CSS)
const MAX_RADIUS = 18;
const MIN_SHARE = 0.03; // bolhas menores que 3% da escala não são desenhadas (poluem sem informar)
const LABELS = 3; // rótulos de valor nas maiores bolhas visíveis / faixas do perfil
const PROFILE_MAX_WIDTH = 140; // px (CSS)
const PROFILE_ROW_PX = 4; // altura de cada faixa do perfil (px CSS)

// índice da vela que contém o instante t (última vela com time <= t); -1 se antes do gráfico
export function barIndex(points, t) {
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

const valueOf = (row, source) => (source === "binance" ? row.by?.[BINANCE] : row);

// evento = liquidações de um lado num período, com o preço onde ficam e a faixa de preço percorrida
function eventsOfCandle(t, candle, v, out, index) {
  const long = Number(v.long) || 0;
  const short = Number(v.short) || 0;
  const open = Number.isFinite(candle.open) ? candle.open : candle.close;
  if (long > 0) out.push({ index, t, side: "long", usd: long, price: candle.low, lo: candle.low, hi: Math.max(candle.low, open) });
  if (short > 0) out.push({ index, t, side: "short", usd: short, price: candle.high, lo: Math.min(candle.high, open), hi: candle.high });
}

/**
 * Eventos de liquidação nas velas do gráfico: [{ index, t, side, usd, price, lo, hi }].
 * points = velas do gráfico; rows = /liquidations no tamanho de vela do gráfico (usadas antes do histórico
 * horário); hourly = { rows: /liquidations em 1h, candles: velas de 1h } ou null; source = "all" | "binance".
 * Com dado horário, as velas do gráfico a partir da primeira que ele cobre inteira usam cada hora na sua
 * vela de 1h; as anteriores, a vela do gráfico.
 */
export function liquidationEvents(points, rows, hourly = null, source = "all") {
  if (!points?.length) return [];
  const out = [];
  // primeira vela do gráfico coberta inteira pelo dado horário (liquidações e velas de 1h)
  let firstHourlyBar = points.length;
  let hourlyFrom = Infinity;
  if (hourly?.rows?.length && hourly?.candles?.length) {
    hourlyFrom = Math.max(hourly.rows[0].t, hourly.candles[0].time);
    const i = barIndex(points, hourlyFrom);
    firstHourlyBar = i < 0 ? 0 : points[i].time >= hourlyFrom ? i : i + 1;
  }
  for (const row of rows || []) {
    const i = barIndex(points, row.t);
    if (i < 0 || i >= firstHourlyBar) continue;
    const v = valueOf(row, source);
    if (v) eventsOfCandle(row.t, points[i], v, out, i);
  }
  if (firstHourlyBar < points.length) {
    const start = points[firstHourlyBar].time;
    const candles = hourly.candles;
    for (const row of hourly.rows) {
      if (row.t < start) continue;
      const v = valueOf(row, source);
      if (!v) continue;
      const c = candles[barIndex(candles, row.t)];
      const i = barIndex(points, row.t);
      if (!c || i < 0 || c.time + 3600e3 <= row.t) continue; // hora sem vela de 1h
      eventsOfCandle(row.t, c, v, out, i);
    }
  }
  return out.sort((a, b) => a.index - b.index || a.t - b.t);
}

/**
 * Uma bolha por vela e por lado: [{ index, side, usd, price }]; o preço é a média dos preços dos eventos
 * da vela, ponderada pelo valor (com dado horário, fica perto de onde a maior parte aconteceu).
 */
export function barBubbles(events) {
  const map = new Map();
  for (const e of events) {
    const key = `${e.index}|${e.side}`;
    const b = map.get(key) || { index: e.index, side: e.side, usd: 0, weighted: 0 };
    b.usd += e.usd;
    b.weighted += e.usd * e.price;
    map.set(key, b);
  }
  return [...map.values()].map(({ index, side, usd, weighted }) => ({ index, side, usd, price: weighted / usd }));
}

/**
 * Perfil por preço: os eventos das velas [fromIndex, toIndex] espalhados (por igual) na faixa de preço de
 * cada um e somados em `rows` faixas entre lo e hi: [{ from, to, long, short }] (de baixo para cima).
 * Evento sem faixa (lo = hi) vai inteiro para a faixa do preço. log: true → faixas em progressão
 * geométrica (escala logarítmica do gráfico: todas com a mesma altura na tela).
 */
export function priceProfile(events, { fromIndex, toIndex, lo, hi, rows, log = false }) {
  // escala log: faixas em progressão geométrica (mesma altura na tela); exige lo > 0
  const geo = log && lo > 0;
  const edge = (k) => (geo ? lo * (hi / lo) ** (k / rows) : lo + ((hi - lo) * k) / rows);
  const out = Array.from({ length: rows }, (_, k) => ({ from: edge(k), to: edge(k + 1), long: 0, short: 0 }));
  if (!(hi > lo) || rows < 1) return out;
  const frac = (p) => (geo ? Math.log(p / lo) / Math.log(hi / lo) : (p - lo) / (hi - lo));
  const rowOf = (p) => Math.min(rows - 1, Math.max(0, Math.floor(frac(p) * rows)));
  for (const e of events) {
    if (e.index < fromIndex || e.index > toIndex) continue;
    const a = Math.max(lo, e.lo);
    const b = Math.min(hi, e.hi);
    if (e.hi <= e.lo) {
      if (e.price >= lo && e.price <= hi) out[rowOf(e.price)][e.side] += e.usd;
      continue;
    }
    if (b <= a) continue; // fora da faixa visível
    const perUnit = e.usd / (e.hi - e.lo);
    for (let k = rowOf(a); k <= rowOf(b); k++) {
      const overlap = Math.min(b, out[k].to) - Math.max(a, out[k].from);
      if (overlap > 0) out[k][e.side] += perUnit * overlap;
    }
  }
  return out;
}

/** As n maiores bolhas (por vela e lado) entre as velas [fromIndex, toIndex], a partir de minUsd */
export function topBubbles(bubbles, n, fromIndex, toIndex, minUsd = 0) {
  return bubbles
    .filter((b) => b.index >= fromIndex && b.index <= toIndex && b.usd >= minUsd)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, n);
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
 * Valor em US$ digitado no limite: "5M", "1,5 mi", "500k", "2B", "300000" (vazio = 0).
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

/**
 * Limite digitado em "Acima de": valor em US$ (parseUsdAmount) ou porcentagem ("20%", "12,5%" = só as
 * 20% maiores visíveis). Devolve { usd, pct } (um dos dois é 0; os dois 0 = todas). Inválido → null.
 */
export function parseBubblesLimit(text) {
  const t = String(text ?? "").trim().replace(/\s+/g, "");
  const m = t.match(/^(\d+(?:[.,]\d+)?)%$/);
  if (m) {
    const pct = Number(m[1].replace(",", "."));
    return pct <= 100 ? { usd: 0, pct } : null;
  }
  if (t.includes("%")) return null;
  const usd = parseUsdAmount(text);
  return usd === null ? null : { usd, pct: 0 };
}

/**
 * Valor de corte (US$) das pct% maiores bolhas entre as velas [fromIndex, toIndex]: quem tem usd >= corte
 * aparece. Sempre sobra pelo menos uma (arredonda para cima); empates no corte entram. Sem bolhas no
 * intervalo, ou pct fora de (0, 100) → 0 (todas).
 */
export function topShareCutoff(bubbles, pct, fromIndex, toIndex) {
  if (!(pct > 0) || pct >= 100) return 0;
  const values = [];
  for (const b of bubbles) if (b.index >= fromIndex && b.index <= toIndex) values.push(b.usd);
  if (!values.length) return 0;
  values.sort((a, b) => b - a);
  return values[Math.ceil((values.length * pct) / 100) - 1];
}

/** Raio (px CSS) de uma bolha, proporcional à raiz do valor (área ∝ valor); null = pequena demais */
export function bubbleRadius(usd, scale) {
  const share = Math.min(1, usd / scale);
  if (share < MIN_SHARE) return null;
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(share);
}

const rgba = (side, a) => `rgba(${COLORS[side].join(", ")}, ${a})`;

export class LiquidationBubbles {
  constructor() {
    this._opts = null;
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

  /**
   * opts = { events (liquidationEvents), style: "profile" | "bubbles" | "top", minUsd, pct, top } ou null
   * para esconder. minUsd (US$) ou pct (só as pct% maiores entre as velas visíveis, recalculado a cada
   * desenho) valem para as bolhas e os maiores eventos; o perfil usa tudo.
   */
  setData(opts) {
    if (!opts?.events?.length && !this._opts) return;
    if (!opts?.events?.length) {
      this._opts = null;
    } else {
      const bubbles = barBubbles(opts.events);
      const { list, scale } = bubblesAbove(bubbles, opts.pct > 0 ? 0 : opts.minUsd || 0);
      this._opts = { ...opts, bubbles, shown: list, scale };
    }
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return [this._view];
  }

  _draw(target) {
    const o = this._opts;
    if (!o || !this._chart || !this._series) return;
    const ts = this._chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const fromIndex = Math.floor(range.from) - 1;
    const toIndex = Math.ceil(range.to) + 1;
    // limite em %: o corte vem das velas visíveis agora (muda ao arrastar ou dar zoom)
    const minUsd =
      o.style === "profile" ? 0 : o.pct > 0 ? topShareCutoff(o.bubbles, o.pct, fromIndex, toIndex) : o.minUsd || 0;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.font = `${Math.round(11 * scope.verticalPixelRatio)}px Manrope, sans-serif`;
      ctx.textBaseline = "middle";
      if (o.style === "bubbles") this._drawBubbles(scope, ts, fromIndex, toIndex, minUsd);
      else if (o.style === "top") this._drawTop(scope, ts, fromIndex, toIndex, minUsd);
      else this._drawProfile(scope, fromIndex, toIndex);
    });
  }

  // rótulo com fundo escuro; align "left" (texto começa em x) ou "right" (termina em x)
  _label(ctx, text, x, y, color, { hr, vr }, align = "left") {
    const tw = ctx.measureText(text).width;
    const left = align === "left" ? x : x - tw;
    ctx.fillStyle = "rgba(11, 16, 36, 0.8)";
    ctx.fillRect(left - 3 * hr, y - 8 * vr, tw + 6 * hr, 16 * vr);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(text, left, y);
  }

  _drawBubbles({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }, ts, fromIndex, toIndex, minUsd) {
    const o = this._opts;
    const visible = [];
    for (const b of o.shown) {
      if (b.index < fromIndex || b.index > toIndex || b.usd < minUsd) continue;
      const r = bubbleRadius(b.usd, o.scale);
      if (r === null) continue;
      const x = ts.logicalToCoordinate(b.index);
      const y = this._series.priceToCoordinate(b.price);
      if (x === null || y === null) continue;
      visible.push({ ...b, x: x * hr, y: y * vr, r: r * hr });
    }
    // maiores primeiro: as pequenas ficam por cima e continuam visíveis
    visible.sort((a, b) => b.usd - a.usd);
    for (const b of visible) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(b.side, 0.28);
      ctx.fill();
      ctx.lineWidth = Math.max(1, hr);
      ctx.strokeStyle = rgba(b.side, 0.85);
      ctx.stroke();
    }
    for (const b of visible.slice(0, LABELS)) {
      const text = formatUsdShort(b.usd);
      const tw = ctx.measureText(text).width;
      const x = Math.min(b.x + b.r + 4 * hr, bitmapSize.width - tw - 8 * hr);
      this._label(ctx, text, x, b.y, rgba(b.side, 1), { hr, vr });
    }
  }

  _drawTop({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }, ts, fromIndex, toIndex, minUsd) {
    const o = this._opts;
    const width = bitmapSize.width;
    const used = []; // y dos rótulos já desenhados (não sobrepor)
    for (const b of topBubbles(o.bubbles, o.top || 5, fromIndex, toIndex, minUsd)) {
      const x = ts.logicalToCoordinate(b.index);
      const yc = this._series.priceToCoordinate(b.price);
      if (x === null || yc === null) continue;
      const px = x * hr;
      const y = yc * vr;
      ctx.strokeStyle = rgba(b.side, 0.75);
      ctx.lineWidth = Math.max(1, hr);
      ctx.setLineDash([5 * hr, 4 * hr]);
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, y, 4 * hr, 0, Math.PI * 2);
      ctx.fillStyle = rgba(b.side, 0.95);
      ctx.fill();
      let ly = y - 9 * vr; // rótulo logo acima da linha, encostado na direita
      while (used.some((u) => Math.abs(u - ly) < 16 * vr)) ly -= 16 * vr;
      used.push(ly);
      const text = `${b.side === "long" ? "Longs" : "Shorts"} ${formatUsdShort(b.usd)} · ${formatPrice(Number(b.price.toPrecision(5)))}`;
      this._label(ctx, text, width - 6 * hr, ly, rgba(b.side, 1), { hr, vr }, "right");
    }
  }

  _drawProfile({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }, fromIndex, toIndex) {
    const o = this._opts;
    const heightCss = bitmapSize.height / vr;
    const top = this._series.coordinateToPrice(0);
    const bottom = this._series.coordinateToPrice(heightCss);
    if (top === null || bottom === null) return;
    const rows = Math.max(10, Math.floor(heightCss / PROFILE_ROW_PX));
    const log = this._series.priceScale().options().mode === window.LightweightCharts?.PriceScaleMode.Logarithmic;
    const profile = priceProfile(o.events, { fromIndex, toIndex, lo: Math.min(top, bottom), hi: Math.max(top, bottom), rows, log });
    const max = Math.max(0, ...profile.map((r) => r.long + r.short));
    if (!max) return;
    const maxW = PROFILE_MAX_WIDTH * hr;
    const placed = [];
    for (const r of profile) {
      const total = r.long + r.short;
      if (!total) continue;
      const y1 = this._series.priceToCoordinate(r.to);
      const y2 = this._series.priceToCoordinate(r.from);
      if (y1 === null || y2 === null) continue;
      const y = Math.min(y1, y2) * vr;
      const h = Math.max(1, Math.abs(y2 - y1) * vr - 1);
      const wLong = (r.long / max) * maxW;
      const wShort = (r.short / max) * maxW;
      ctx.fillStyle = rgba("long", 0.55);
      ctx.fillRect(0, y, wLong, h);
      ctx.fillStyle = rgba("short", 0.55);
      ctx.fillRect(wLong, y, wShort, h);
      placed.push({ total, y: y + h / 2, w: wLong + wShort, side: r.long >= r.short ? "long" : "short" });
    }
    // valor das maiores faixas, sem sobrepor rótulos
    const used = [];
    let count = 0;
    for (const p of placed.sort((a, b) => b.total - a.total)) {
      if (count >= LABELS) break;
      if (used.some((u) => Math.abs(u - p.y) < 18 * vr)) continue;
      used.push(p.y);
      count++;
      this._label(ctx, formatUsdShort(p.total), p.w + 6 * hr, p.y, rgba(p.side, 1), { hr, vr });
    }
  }
}

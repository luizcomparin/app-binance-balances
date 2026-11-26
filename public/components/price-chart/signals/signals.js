// Sinais de compra e venda: núcleo puro (sem DOM, sem rede e sem ler o "agora" por conta própria).
// Lê as velas diárias e semanais de uma moeda e devolve a tendência, a região (fundo/topo provável)
// e a lista de sinais. Não é previsão. Documentação: docs/sinais/.
//
// Vela em andamento: o valor e o estado "ativo" de cada sinal usam a última vela (mesmo em formação);
// "há N velas" (`bars`) conta só velas FECHADAS seguidas. Ativo com bars = 0 fica `forming: true`.
// Para calcular uma data passada (backtest), passe as velas até ela e `now` no fim da última vela.

import { movingAverage } from "../chart/movingAverage.js";
import { rsi } from "../chart/rsi.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Limiares fixos da v1 (ver docs/sinais/catalogo-de-sinais.md)
export const SIGNAL_DEFAULTS = {
  d: { ms: DAY_MS, maShort: 50, maLong: 200, stretchMa: 200, minSamples: 365 },
  w: { ms: 7 * DAY_MS, maShort: 20, maLong: 50, stretchMa: 50, minSamples: 52 },
  slopeBars: 10, // inclinação da média longa: valor atual × o de N velas atrás
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  stretchLow: 10, // percentil da esticagem que conta como fundo
  stretchHigh: 90, // ... e como topo
  regionMin: 3, // sinais do lado dominante para "fundo/topo provável"
  regionMaxOpposite: 1, // ... com no máximo estes do lado oposto
};

const TF_LABEL = { d: "diário", w: "semanal" };
const TF_LABEL_FEM = { d: "diária", w: "semanal" }; // "tendência diária", "SMA 200 diária"
const BAR_UNIT = { d: ["dia", "dias"], w: ["semana", "semanas"] };

const num = (v, digits = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signedPct = (v) => `${v > 0 ? "+" : ""}${num(v)}%`;
const barsText = (n, tf) => `${n} ${BAR_UNIT[tf][n === 1 ? 0 : 1]}`;
// "há 3 dias" ou, se só a vela em andamento está na zona, "na vela em formação"
const sinceText = (bars, tf) => (bars > 0 ? `há ${barsText(bars, tf)}` : "na vela em formação");

/** Índice da última vela fechada: a última vela só conta como fechada se já terminou em `now`. -1 = nenhuma. */
export function lastClosedIndex(points, barMs, now) {
  const n = points?.length || 0;
  if (!n) return -1;
  return points[n - 1].time + barMs <= now ? n - 1 : n - 2;
}

/** Quantos valores seguidos, terminando em `end` e andando para trás, satisfazem `test` (null interrompe). */
export function streak(values, end, test) {
  let count = 0;
  for (let i = end; i >= 0 && values[i] !== null && values[i] !== undefined && test(values[i]); i--) count++;
  return count;
}

/** Percentil (0–100) de `value` numa amostra ORDENADA: a parte da amostra que fica abaixo dele. Amostra vazia: null. */
export function percentileRank(sorted, value) {
  if (!sorted?.length) return null;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return (lo / sorted.length) * 100;
}

const unavailable = (id, group, timeframe, reason, text) => ({
  id, group, timeframe, available: false, reason, active: false, side: null, value: null, bars: 0, forming: false, text,
});

/**
 * Tendência por médias: alta com o fechamento acima das duas médias e a curta acima da longa;
 * baixa com o inverso; qualquer outra combinação é lateral.
 */
export function trendSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const { ms, maShort, maLong } = cfg[tf];
  const id = `trend-ma-${tf}`;
  const n = points?.length || 0;
  const short = movingAverage(points || [], maShort);
  const long = movingAverage(points || [], maLong);
  if (!n || long[n - 1] === null) {
    return unavailable(id, "trend", tf, "history", `Tendência ${TF_LABEL_FEM[tf]}: histórico insuficiente para a SMA ${maLong}`);
  }

  const stateAt = (i) => {
    if (long[i] === null || short[i] === null) return null;
    const c = points[i].close;
    if (c > short[i] && c > long[i] && short[i] > long[i]) return "up";
    if (c < short[i] && c < long[i] && short[i] < long[i]) return "down";
    return "side";
  };
  const states = points.map((_, i) => stateAt(i));
  const side = states[n - 1];
  const bars = streak(states, lastClosedIndex(points, ms, now), (s) => s === side);

  const back = long[n - 1 - cfg.slopeBars];
  const slope = back ? (long[n - 1] / back - 1) * 100 : null;
  const name = { up: "alta", down: "baixa", side: "lateral" }[side];
  const slopeText = slope === null ? "" : `; SMA ${maLong} ${slope >= 0 ? "subindo" : "caindo"} (${signedPct(slope)} em ${cfg.slopeBars} velas)`;

  return {
    id, group: "trend", timeframe: tf, available: true,
    active: side !== "side", side, value: null, bars, forming: bars === 0,
    details: { close: points[n - 1].close, maShort: short[n - 1], maLong: long[n - 1], slope, periods: [maShort, maLong] },
    text: `Tendência ${TF_LABEL_FEM[tf]}: ${name} ${sinceText(bars, tf)} (preço × SMA ${maShort} e SMA ${maLong})${slopeText}`,
  };
}

/** RSI em sobrevenda (fundo) ou sobrecompra (topo). */
export function rsiSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const id = `rsi-${tf}`;
  const n = points?.length || 0;
  const values = rsi(points, cfg.rsiPeriod);
  const value = n ? values[n - 1] : null;
  if (value === null) {
    return unavailable(id, "extreme", tf, "history", `RSI ${TF_LABEL[tf]}: histórico insuficiente`);
  }

  const zone = (v) => (v <= cfg.rsiOversold ? "bottom" : v >= cfg.rsiOverbought ? "top" : null);
  const side = zone(value);
  const bars = side ? streak(values, lastClosedIndex(points, cfg[tf].ms, now), (v) => zone(v) === side) : 0;
  const label = `RSI ${cfg.rsiPeriod} ${TF_LABEL[tf]} em ${num(value)}`;

  return {
    id, group: "extreme", timeframe: tf, available: true,
    active: !!side, side, value, bars, forming: !!side && bars === 0,
    text: side ? `${label}: ${side === "bottom" ? "sobrevendido" : "sobrecomprado"} ${sinceText(bars, tf)}` : `${label}: neutro`,
  };
}

/**
 * Esticagem: distância do fechamento até a média (em %), comparada com o histórico da própria moeda.
 * Fundo: abaixo da média e entre os valores mais baixos do histórico; topo: acima da média e entre os mais altos.
 * A amostra são as velas fechadas; a vela em formação é só comparada com ela.
 */
export function stretchSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const { ms, stretchMa, minSamples } = cfg[tf];
  const id = `stretch-${tf}`;
  const n = points?.length || 0;
  const ma = movingAverage(points || [], stretchMa);
  const values = ma.map((m, i) => (m ? (points[i].close / m - 1) * 100 : null));
  const closed = lastClosedIndex(points, ms, now);
  const sample = values.slice(0, closed + 1).filter((v) => v !== null);
  const value = n ? values[n - 1] : null;
  if (value === null || sample.length < minSamples) {
    return unavailable(id, "extreme", tf, "history", `Esticagem da SMA ${stretchMa} ${TF_LABEL_FEM[tf]}: histórico insuficiente para comparar`);
  }

  const sorted = sample.slice().sort((a, b) => a - b);
  const zone = (v) => {
    const p = percentileRank(sorted, v);
    if (v < 0 && p <= cfg.stretchLow) return "bottom";
    if (v > 0 && p >= cfg.stretchHigh) return "top";
    return null;
  };
  const side = zone(value);
  const bars = side ? streak(values, closed, (v) => zone(v) === side) : 0;
  const percentile = percentileRank(sorted, value);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const where = `Preço ${signedPct(value)} da SMA ${stretchMa} ${TF_LABEL_FEM[tf]}`;
  const history = `acima de ${num(percentile, 0)}% do histórico (extremos: ${signedPct(min)} e ${signedPct(max)})`;

  return {
    id, group: "extreme", timeframe: tf, available: true,
    active: !!side, side, value, bars, forming: !!side && bars === 0, percentile,
    details: { ma: ma[n - 1], period: stretchMa, min, max, samples: sorted.length },
    text: side
      ? `${where}: muito ${side === "bottom" ? "abaixo" : "acima"} da média ${sinceText(bars, tf)}, ${history}`
      : `${where}: ${history}`,
  };
}

/** Placar de confluência: conta os sinais de fundo e de topo ativos entre os disponíveis do grupo "extreme". */
export function regionOf(signals, cfg = SIGNAL_DEFAULTS) {
  const usable = signals.filter((s) => s.group === "extreme" && s.available);
  const bottom = usable.filter((s) => s.active && s.side === "bottom").length;
  const top = usable.filter((s) => s.active && s.side === "top").length;
  const wins = (a, b) => a >= cfg.regionMin && b <= cfg.regionMaxOpposite;
  const side = wins(bottom, top) ? "bottom" : wins(top, bottom) ? "top" : "neutral";
  return { side, bottom, top, of: usable.length };
}

/**
 * Análise completa de uma moeda.
 * daily / weekly: velas [{ time (ms da abertura), close, ... }] em ordem crescente; now: instante da análise (ms).
 * Devolve { asset, generatedAt, trend: { d, w }, region, signals } (serializável em JSON).
 */
export function analyzeSignals({ asset, daily, weekly, now }, cfg = SIGNAL_DEFAULTS) {
  const series = { d: daily || [], w: weekly || [] };
  const signals = [];
  for (const tf of ["d", "w"]) signals.push(trendSignal(series[tf], tf, now, cfg));
  for (const tf of ["d", "w"]) signals.push(rsiSignal(series[tf], tf, now, cfg));
  for (const tf of ["d", "w"]) signals.push(stretchSignal(series[tf], tf, now, cfg));

  const trendOf = (tf) => {
    const s = signals.find((x) => x.id === `trend-ma-${tf}`);
    return s.available ? s.side : null;
  };
  return {
    asset,
    generatedAt: now,
    trend: { d: trendOf("d"), w: trendOf("w") },
    region: regionOf(signals, cfg),
    signals,
  };
}

// MACD sobre o fechamento, como no TradingView:
//   MACD = média rápida − média lenta (EMA por padrão; a EMA começa pela SMA das primeiras velas)
//   Sinal = média do MACD;   Histograma = MACD − Sinal
import { movingAverage } from "./movingAverage.js";
import { rsiMovingAverage } from "./rsi.js";

export const MACD_DEFAULT = {
  fast: 12,
  slow: 26,
  signal: 9,
  oscType: "EMA", // média das linhas rápida e lenta
  signalType: "EMA", // média da linha de sinal
  macdColor: "#4d8dff",
  signalColor: "#ff9f43",
  showHist: true,
  histUpColor: "#26a69a",
  histDownColor: "#ff5252",
  histOpacity: 0.85,
};

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

/**
 * Configurações do painel do MACD dentro dos limites: rápida 2–100, lenta 2–200, sinal 1–100, médias
 * EMA/SMA, cores "#rrggbb" e opacidade do histograma 5–100%. Valores inválidos voltam ao padrão.
 */
export function normalizeMacdSettings(c) {
  const d = MACD_DEFAULT;
  const opacity = Number(c?.histOpacity ?? d.histOpacity);
  return {
    fast: clampInt(c?.fast, 2, 100, d.fast),
    slow: clampInt(c?.slow, 2, 200, d.slow),
    signal: clampInt(c?.signal, 1, 100, d.signal),
    oscType: c?.oscType === "SMA" ? "SMA" : "EMA",
    signalType: c?.signalType === "SMA" ? "SMA" : "EMA",
    macdColor: hex(c?.macdColor, d.macdColor),
    signalColor: hex(c?.signalColor, d.signalColor),
    showHist: c?.showHist !== false,
    histUpColor: hex(c?.histUpColor, d.histUpColor),
    histDownColor: hex(c?.histDownColor, d.histDownColor),
    histOpacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : d.histOpacity,
  };
}

/**
 * points = velas ({ close }); s = configurações normalizadas. Devolve { macd, signal, hist } alinhados às
 * velas, com null enquanto as médias ainda não têm velas suficientes.
 */
export function macd(points, s) {
  const pts = points || [];
  const fast = movingAverage(pts, s.fast, s.oscType, "close");
  const slow = movingAverage(pts, s.slow, s.oscType, "close");
  const line = pts.map((_, i) => (fast[i] === null || slow[i] === null ? null : fast[i] - slow[i]));
  const signal = rsiMovingAverage(line, s.signal, s.signalType);
  const hist = line.map((v, i) => (v === null || signal[i] === null ? null : v - signal[i]));
  return { macd: line, signal, hist };
}

/**
 * Tom de cada barra do histograma, como no TradingView: acima de zero e crescendo = alta forte; acima e
 * diminuindo = alta enfraquecendo; abaixo e caindo = baixa forte; abaixo e subindo = baixa enfraquecendo.
 * Devolve [{ up, strong }] (null onde não há histograma).
 */
export function macdHistogramTones(hist) {
  return (hist || []).map((v, i) => {
    if (v === null) return null;
    const prev = i > 0 ? hist[i - 1] : null;
    const up = v >= 0;
    // primeira barra: forte
    const strong = prev === null ? true : up ? v >= prev : v <= prev;
    return { up, strong };
  });
}

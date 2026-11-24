// RSI (Índice de Força Relativa) sobre o fechamento, como no TradingView: médias de altas e de baixas
// com a suavização de Wilder (RMA), começando pela média simples das primeiras `period` variações.
//   RSI = 100 − 100 / (1 + média das altas / média das baixas)   (sem baixas no período: 100; sem altas: 0)

export const RSI_DEFAULT = { period: 14, overbought: 70, oversold: 30, color: "#a78bfa", opacity: 1 };

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Configurações do painel do RSI dentro dos limites: período 2–100, sobrecompra 51–99, sobrevenda 1–49,
 * cor "#rrggbb" e opacidade 5–100%. Valores inválidos voltam ao padrão.
 */
export function normalizeRsiSettings(c) {
  const opacity = Number(c?.opacity ?? 1);
  return {
    period: clampInt(c?.period, 2, 100, RSI_DEFAULT.period),
    overbought: clampInt(c?.overbought, 51, 99, RSI_DEFAULT.overbought),
    oversold: clampInt(c?.oversold, 1, 49, RSI_DEFAULT.oversold),
    color: /^#[0-9a-f]{6}$/i.test(c?.color) ? c.color : RSI_DEFAULT.color,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : 1,
  };
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

// Médias móveis sobre os fechamentos das velas (funções puras, sem DOM).

/**
 * Média móvel de `period` velas, alinhada a `points` (mesmo tamanho):
 * null nas primeiras velas, enquanto ainda não há histórico suficiente.
 * type: "SMA" (simples) | "EMA" (exponencial, começa pela SMA das primeiras `period` velas)
 */
export function movingAverage(points, period, type = "SMA") {
  const out = new Array(points.length).fill(null);
  if (period < 1 || points.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += points[i].close;
  out[period - 1] = sum / period;

  if (type === "EMA") {
    const k = 2 / (period + 1);
    for (let i = period; i < points.length; i++) out[i] = points[i].close * k + out[i - 1] * (1 - k);
  } else {
    for (let i = period; i < points.length; i++) {
      sum += points[i].close - points[i - period].close;
      out[i] = sum / period;
    }
  }
  return out;
}

// cor da linha com a opacidade escolhida: "#ffd166" + 0.5 → "rgba(255, 209, 102, 0.5)"
export function maColor({ color, opacity = 1 }) {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

// "EMA 50"
export const maLabel = (ma) => `${ma.type} ${ma.period}`;

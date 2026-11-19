// Período ↔ tamanho de vela (funções puras, sem DOM).
//   - período (7d, 30d, 6m, 1y, 2y, all ou <n>d|<n>m|<n>y) define a janela visível;
//   - cada período tem uma vela recomendada (até ~500 velas na tela);
//   - uma janela não pode pedir mais que MAX_CANDLES velas de uma vez.
import { KLINES_PAGE } from "./chartData.js";

const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;
// duração aproximada de cada vela (mês ≈ 30 dias) — só para estimar quantidade de velas
export const INTERVAL_MS = { "1h": HOUR, "4h": 4 * HOUR, "1d": DAY, "1w": 7 * DAY, "1M": 30 * DAY };
const INTERVAL_ORDER = ["1h", "4h", "1d", "1w", "1M"];
// limite de velas carregadas de uma vez ao enquadrar uma janela (3 páginas da Binance)
export const MAX_CANDLES = 3 * KLINES_PAGE;
// a Binance começou a operar em jul/2017: base para estimar o "Tudo"
const BINANCE_START = Date.UTC(2017, 6, 14);
const PRESET_DAYS = { "7d": 7, "30d": 30, "90d": 90, "6m": 182, "1y": 365, "2y": 730, all: Infinity };
const CUSTOM_UNIT_DAYS = { d: 1, m: 30, y: 365 };

export function rangeDays(range) {
  if (range in PRESET_DAYS) return PRESET_DAYS[range];
  const m = /^(\d{1,4})([dmy])$/.exec(range);
  return m ? Number(m[1]) * CUSTOM_UNIT_DAYS[m[2]] : 30;
}

// Vela recomendada para um período: a menor que deixa o gráfico com até ~500 velas
export function recommendedInterval(days) {
  if (days === Infinity) return "1w";
  const totalMs = days * DAY;
  return ["1h", "4h", "1d", "1w"].find((i) => totalMs / INTERVAL_MS[i] <= 500) || "1w";
}

// Sobe o tamanho da vela enquanto a janela pedir mais velas do que o limite
export function fitInterval(interval, fromMs) {
  const span = Date.now() - Math.max(fromMs, BINANCE_START);
  let i = INTERVAL_ORDER.indexOf(interval);
  while (i < INTERVAL_ORDER.length - 1 && span / INTERVAL_MS[INTERVAL_ORDER[i]] > MAX_CANDLES) i++;
  return INTERVAL_ORDER[i];
}

// Janela de tempo de um período, terminando agora: { fromMs, toMs: null } (fromMs 0 = tudo)
export function rangeWindow(range) {
  const days = rangeDays(range);
  return { fromMs: days === Infinity ? 0 : Date.now() - days * DAY, toMs: null };
}

// Janela que a vela escolhida comporta: encurta o início para no máximo MAX_CANDLES velas
export function clampWindow(win, interval) {
  const end = win.toMs ?? Date.now();
  return { ...win, fromMs: Math.max(win.fromMs, end - MAX_CANDLES * INTERVAL_MS[interval]) };
}

// Eixos do gráfico: conversão de tempo (fuso) e formato/precisão de preço.
import { formatPrice } from "../../../core/format.js";

// Velas intradiárias são exibidas no horário local; diárias/semanais seguem o dia UTC (igual à Binance)
export const INTRADAY = new Set(["1h", "4h"]);

// O Lightweight Charts mostra o tempo como UTC: desloca pelo fuso para exibir hora local
export function toChartTime(ms, interval) {
  const shift = INTRADAY.has(interval) ? new Date(ms).getTimezoneOffset() * 60000 : 0;
  return Math.floor((ms - shift) / 1000);
}

// Inverso de toChartTime (aproximado no fuso atual; suficiente para enquadrar janelas)
export function fromChartTime(t, interval) {
  const ms = t * 1000;
  return INTRADAY.has(interval) ? ms + new Date(ms).getTimezoneOffset() * 60000 : ms;
}

// Tempo do gráfico (já deslocado) formatado como data, com hora nas velas intradiárias
export function formatChartTime(t, withTime = true) {
  return new Date(t * 1000).toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

// Casas decimais do eixo conforme a grandeza do preço (BTC 2 casas, PEPE 8+)
export function priceFormatFor(price) {
  const p = Math.abs(price || 0);
  const precision = p >= 1000 ? 2 : p >= 1 ? 4 : p > 0 ? Math.min(12, Math.ceil(-Math.log10(p)) + 3) : 4;
  return { type: "price", precision, minMove: 10 ** -precision };
}

// Valores do eixo/mira arredondados à precisão da moeda: evita resíduos de ponto flutuante
// como 0,0000000000000002776 na marca que deveria ser 0
export function formatAxisPrice(p, precision) {
  const rounded = Number(Number(p).toFixed(precision));
  return formatPrice(Object.is(rounded, -0) ? 0 : rounded);
}

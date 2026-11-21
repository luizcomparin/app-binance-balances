// Utilitários dos gráficos da aba "Gráficos de Distribuição" (Chart.js)
import { state } from "../../core/state.js";

export const fmt2 = (v) => v.toFixed(2).formatCurrency();
export const brlOf = (usdt) => (state.usdtBrlPrice ? `${fmt2(usdt * state.usdtBrlPrice)} BRL` : "--");
export const pct1 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

// balão das dicas (mesmo visual em todos os gráficos)
export const TOOLTIP_STYLE = {
  backgroundColor: "#11172e",
  titleColor: "#4dd4ff",
  bodyColor: "#e5ecff",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  padding: 12,
};

export const AXIS_TICKS = { color: "#9bb0d6", font: { size: 11, family: "Manrope" } };
export const LABEL_TICKS = { color: "#e5ecff", font: { size: 12, family: "Manrope", weight: "600" } };
export const GRID = { color: "rgba(255, 255, 255, 0.05)" };

// altura do gráfico de barras horizontais conforme a quantidade de barras (~28px cada)
export function fitBarHeight(wrapId, count, perBar = 28) {
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.style.height = `${Math.max(200, count * perBar + 40)}px`;
}

/**
 * Botão "Mostrar todas (N) / Mostrar só as N maiores" de um gráfico.
 * Devolve { slice(list) } — a lista cortada conforme o botão.
 */
export function createTopToggle(buttonId, limit, onChange) {
  let showAll = false;
  const btn = document.getElementById(buttonId);
  btn?.addEventListener("click", () => {
    showAll = !showAll;
    onChange();
  });
  return {
    slice(list) {
      if (btn) {
        btn.hidden = list.length <= limit;
        btn.textContent = showAll ? `Mostrar só as ${limit} maiores` : `Mostrar todas (${list.length})`;
      }
      return showAll ? list : list.slice(0, limit);
    },
  };
}

// Topbar: botão único "Atualizar" (recarrega tudo o que a tela mostra) e o "Atualizado há X min".
import { on, BALANCES_UPDATED } from "../../core/events.js";
import { loadBalances } from "../balances/BalancesPanel.js";
import { loadOrders } from "../orders/OrdersPanel.js";
import { refreshExecutedOrders } from "../executed/ExecutedOrdersPanel.js";
import { refreshPriceChart } from "../price-chart/PriceChartPanel.js";

const TICK_MS = 30 * 1000; // de quanto em quanto tempo o texto "há X min" é refeito

let lastUpdate = null; // ms da última carteira recebida com sucesso
let refreshing = null; // atualização em andamento (cliques repetidos esperam a mesma)

export function initTopbar() {
  document.getElementById("refresh-all-btn")?.addEventListener("click", refreshAll);

  // a carteira chegou (boot, botão Atualizar ou recarga depois de salvar a chave)
  on(BALANCES_UPDATED, () => {
    lastUpdate = Date.now();
    renderLastUpdate();
  });
  setInterval(renderLastUpdate, TICK_MS);
}

// Recarrega carteira + P&L, ordens abertas, ordens executadas (se a aba já foi aberta)
// e os dados da moeda aberta no gráfico de preço. O server ainda pode responder do cache curto dele.
export function refreshAll() {
  if (refreshing) return refreshing;
  setLoading(true);
  refreshing = Promise.allSettled([
    loadBalances(),
    loadOrders(),
    refreshExecutedOrders(),
    refreshPriceChart(),
  ]).finally(() => {
    refreshing = null;
    setLoading(false);
  });
  return refreshing;
}

function setLoading(loading) {
  const btn = document.getElementById("refresh-all-btn");
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
  const label = btn.querySelector(".refresh-label");
  if (label) label.textContent = loading ? "Atualizando..." : "Atualizar";
}

function renderLastUpdate() {
  const el = document.getElementById("last-update");
  if (!el || !lastUpdate) return;
  el.hidden = false;
  el.textContent = `Atualizado ${relativeTime(Date.now() - lastUpdate)}`;
  el.title = `Carteira recebida em ${new Date(lastUpdate).toLocaleString("pt-BR")}`;
}

function relativeTime(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

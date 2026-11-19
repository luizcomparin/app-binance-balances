// Modal do gráfico de preço: abrir/fechar, períodos, modo Linha/Velas e orquestração do carregamento.
import { state } from "../../core/state.js";
import { formatPrice } from "../../core/format.js";
import { getChartData, loadMyOrders, ordersOnChart } from "./chartData.js";
import { renderPriceChart } from "./chartRender.js";
import {
  buyTargetPlugin,
  initBuySimulator,
  isSimEnabled,
  resetSimPointer,
  setSimContext,
  updateSimAvailability,
} from "./buySimulator.js";

const MODE_STORAGE_KEY = "priceChartMode";

let chart = null;
const view = {
  asset: null,
  range: "30d",
  requestId: 0,
  points: null,
  interval: null,
  mode: readStoredMode(),
};

function readStoredMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "candle" ? "candle" : "line";
  } catch {
    return "line";
  }
}

function isOpen() {
  const modal = document.getElementById("price-chart-modal");
  return !!modal && modal.style.display !== "none";
}

function destroyChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function render() {
  const canvas = document.getElementById("priceChartCanvas");
  if (!canvas || !view.points) return;
  chart = renderPriceChart(canvas, chart, {
    asset: view.asset,
    points: view.points,
    interval: view.interval,
    mode: view.mode,
    avg: state.positions?.[view.asset]?.avgBuyPriceUSDT ?? null,
    orders: ordersOnChart(view.points, view.asset),
    tooltipEnabled: !isSimEnabled(),
    plugins: [buyTargetPlugin],
  });
}

function setMode(mode) {
  view.mode = mode;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {}
  highlightMode();
  render(); // mesmos dados nos dois modos: só redesenha
}

function highlightMode() {
  document.querySelectorAll("#price-chart-mode button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === view.mode);
  });
}

function highlightRange() {
  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === view.range);
  });
  const isCustom = !document.querySelector(`#price-chart-ranges button[data-range="${view.range}"]`);
  document.getElementById("price-chart-custom")?.classList.toggle("active", isCustom);
}

function selectRange(range) {
  view.range = range;
  highlightRange();
  loadChart();
}

export function initPriceChartModal() {
  // posições (preço médio) chegam depois dos saldos: se o modal já estiver aberto, redesenha
  window.addEventListener("positions:updated", () => {
    if (!isOpen()) return;
    updateSimAvailability();
    if (!view.points || state.positionsLoading) return;
    render();
    renderInfo();
  });

  initBuySimulator(() => chart);

  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => selectRange(btn.dataset.range));
  });

  document.querySelectorAll("#price-chart-mode button").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  highlightMode();

  document.getElementById("price-chart-custom")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = parseInt(document.getElementById("price-chart-custom-value").value, 10);
    const unit = document.getElementById("price-chart-custom-unit").value;
    if (!Number.isInteger(n) || n < 1 || n > 9999) return;
    selectRange(`${n}${unit}`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePriceChart();
  });
}

export function openPriceChart(asset) {
  view.asset = asset;
  view.points = null;
  const modal = document.getElementById("price-chart-modal");
  if (modal) modal.style.display = "flex";

  document.getElementById("price-chart-title").innerText = `${asset} / USDT`;
  setSimContext({ asset, lastPrice: null });
  resetSimPointer();
  destroyChart(); // não mostrar (esmaecido) o gráfico da moeda anterior
  const info = document.getElementById("price-chart-info");
  if (info) info.innerHTML = "";
  updateSimAvailability();
  highlightRange();
  loadChart();

  // ordens chegam em paralelo ao gráfico; se vierem depois, redesenha com os pontos
  loadMyOrders().then(() => {
    if (view.asset === asset && view.points && isOpen()) render();
  });
}

export function closePriceChart() {
  const modal = document.getElementById("price-chart-modal");
  if (modal) modal.style.display = "none";
}

export function closePriceChartOnBackdrop(event) {
  if (event.target.id === "price-chart-modal") closePriceChart();
}

function renderInfo() {
  const info = document.getElementById("price-chart-info");
  if (!info || !view.points?.length) return;

  const lastPrice = view.points.at(-1).close;
  const avg = state.positions?.[view.asset]?.avgBuyPriceUSDT ?? null;
  const parts = [`Preço atual: <b>${formatPrice(lastPrice)} USDT</b>`];
  if (avg !== null) {
    const diff = ((lastPrice - avg) / avg) * 100;
    const cls = diff >= 0 ? "pnl-pos" : "pnl-neg";
    parts.push(`Preço médio: <b>${formatPrice(avg)} USDT</b>`);
    parts.push(`<span class="${cls}">${diff >= 0 ? "+" : ""}${diff.toFixed(2).formatCurrency()}% vs. preço médio</span>`);
  } else if (!Object.keys(state.positions || {}).length) {
    parts.push("Preço médio ainda sendo calculado...");
  }
  info.innerHTML = parts.join(" · ");
}

async function loadChart() {
  const requestId = ++view.requestId;
  const wrap = document.getElementById("price-chart-canvas-wrap");
  const error = document.getElementById("price-chart-error");
  wrap?.classList.add("is-loading");
  if (error) error.hidden = true;

  try {
    const data = await getChartData(view.asset, view.range);
    if (requestId !== view.requestId) return; // usuário trocou de período/moeda no meio

    view.points = data.points || [];
    view.interval = data.interval;
    setSimContext({ asset: view.asset, lastPrice: view.points.at(-1)?.close ?? null });
    updateSimAvailability();
    render();
    renderInfo();
  } catch (e) {
    if (requestId !== view.requestId) return;
    destroyChart();
    if (error) {
      error.hidden = false;
      error.textContent = `Não foi possível carregar o gráfico: ${e.message}`;
    }
  } finally {
    if (requestId === view.requestId) wrap?.classList.remove("is-loading");
  }
}

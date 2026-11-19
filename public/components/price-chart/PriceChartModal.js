// Modal do gráfico de preço: abrir/fechar, períodos, modo Linha/Velas e orquestração do carregamento.
import { state } from "../../core/state.js";
import { formatPrice } from "../../core/format.js";
import { getChartData, loadMyOrders, loadOpenOrders, ordersOnChart } from "./chartData.js";
import { renderPriceChart } from "./chartRender.js";
import {
  avgAfterBuys,
  buyTargetPlugin,
  initBuySimulator,
  isSimEnabled,
  resetSimPointer,
  setSimContext,
  updateSimAvailability,
} from "./buySimulator.js";

const MODE_STORAGE_KEY = "priceChartMode";
const PROJECTED_STORAGE_KEY = "priceChartProjectedAvg";

let chart = null;
const view = {
  asset: null,
  range: "30d",
  requestId: 0,
  points: null,
  interval: null,
  mode: readStoredMode(),
  openOrders: null, // { buys, sells } da moeda aberta; null enquanto carrega
  showProjected: readStored(PROJECTED_STORAGE_KEY) === "1",
};

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function readStoredMode() {
  return readStored(MODE_STORAGE_KEY) === "candle" ? "candle" : "line";
}

function positionOf(asset) {
  const pos = state.positions?.[asset];
  return { avg: pos?.avgBuyPriceUSDT ?? null, qty: pos?.qty ?? null };
}

function projectedAvg() {
  if (!view.showProjected || !view.openOrders) return null;
  return avgAfterBuys(positionOf(view.asset), view.openOrders.buys);
}

// Checkbox do preço médio projetado: spinner enquanto carrega posição/ordens, desabilitado se não se aplica
function updateProjectedAvailability() {
  const input = document.getElementById("price-chart-projected");
  const label = document.getElementById("price-chart-projected-label");
  const text = document.getElementById("price-chart-projected-text");
  if (!input || !label) return;

  const loading = state.positionsLoading || !view.openOrders;
  const pos = positionOf(view.asset);
  const hasBuys = !!view.openOrders?.buys.length;
  const ok = !loading && !!(pos.avg && pos.qty) && hasBuys;

  input.checked = view.showProjected;
  input.disabled = !ok;
  label.classList.toggle("is-loading", loading);
  label.classList.toggle("disabled", !loading && !ok);
  label.title = ok || loading
    ? ""
    : !hasBuys
      ? "Nenhuma ordem de compra aberta para esta moeda"
      : "Disponível apenas para moedas com preço médio calculado";
  if (text) text.textContent = loading ? "Carregando ordens abertas..." : "Preço médio após compras abertas";
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
    avg: positionOf(view.asset).avg,
    orders: ordersOnChart(view.points, view.asset),
    openOrders: view.openOrders,
    projectedAvg: projectedAvg(),
    tooltipEnabled: !isSimEnabled(),
    plugins: [buyTargetPlugin],
  });
}

function setMode(mode) {
  view.mode = mode;
  writeStored(MODE_STORAGE_KEY, mode);
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
    updateProjectedAvailability();
    if (!view.points || state.positionsLoading) return;
    render();
    renderInfo();
  });

  initBuySimulator(() => chart);

  const projectedInput = document.getElementById("price-chart-projected");
  projectedInput?.addEventListener("change", () => {
    view.showProjected = projectedInput.checked;
    writeStored(PROJECTED_STORAGE_KEY, view.showProjected ? "1" : "0");
    render();
  });

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
  view.openOrders = null;
  const modal = document.getElementById("price-chart-modal");
  if (modal) modal.style.display = "flex";

  document.getElementById("price-chart-title").innerText = `${asset} / USDT`;
  setSimContext({ asset, lastPrice: null });
  resetSimPointer();
  destroyChart(); // não mostrar (esmaecido) o gráfico da moeda anterior
  const info = document.getElementById("price-chart-info");
  if (info) info.innerHTML = "";
  updateSimAvailability();
  updateProjectedAvailability();
  highlightRange();
  loadChart();

  // ordens chegam em paralelo ao gráfico; se vierem depois, redesenha com os pontos/linhas
  loadMyOrders().then(() => {
    if (view.asset === asset && view.points && isOpen()) render();
  });
  loadOpenOrders(asset).then((openOrders) => {
    if (view.asset !== asset) return;
    view.openOrders = openOrders;
    updateProjectedAvailability();
    if (view.points && isOpen()) render();
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

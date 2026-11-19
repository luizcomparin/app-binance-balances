// Modal do gráfico de preço: abrir/fechar, tamanho da vela, período, modo Linha/Velas e carregamento.
//
// Como no TradingView, são dois controles (regras em timeframe.js):
//   - tamanho da vela (1h · 4h · D · S · M): redesenha mantendo a janela de tempo que está na tela;
//   - período (7d, 30d, ..., Tudo, customizado): mostra essa janela e escolhe a vela recomendada.
import { state } from "../../core/state.js";
import { formatPrice } from "../../core/format.js";
import { on, POSITIONS_UPDATED } from "../../core/events.js";
import { getKlines, KLINES_PAGE, loadMyOrders, loadOpenOrders, ordersOnChart } from "./chartData.js";
import { createPriceChart } from "./chart/createChart.js";
import { avgAfterBuys, initBuySimulator, setSimContext, updateSimAvailability } from "./buySimulator.js";
import { initAssetPicker } from "./assetPicker.js";
import {
  clampWindow,
  fitInterval,
  INTERVAL_MS,
  MAX_CANDLES,
  rangeDays,
  rangeWindow,
  recommendedInterval,
} from "./timeframe.js";

const MODE_STORAGE_KEY = "priceChartMode";
const INTERVAL_STORAGE_KEY = "priceChartInterval";
const PROJECTED_STORAGE_KEY = "priceChartProjectedAvg";

let chart = null; // controlador do Lightweight Charts (criado uma vez no init)
let picker = null; // seletor de moeda do título
const view = {
  asset: null,
  range: "30d",
  interval: readStoredInterval(),
  requestId: 0,
  points: null,
  loadingOlder: false,
  reachedStart: false, // já chegou na primeira vela da moeda
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

function readStoredInterval() {
  const v = readStored(INTERVAL_STORAGE_KEY);
  return INTERVAL_MS[v] ? v : null; // null = usar o recomendado do período
}

// ---------------------------------------------------------------------------
// preço médio projetado
// ---------------------------------------------------------------------------

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
  if (text) {
    text.textContent = !loading
      ? "Preço médio após compras abertas"
      : state.positionsLoading
        ? "Calculando preço médio..."
        : "Carregando ordens abertas...";
  }
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

function isOpen() {
  const modal = document.getElementById("price-chart-modal");
  return !!modal && modal.style.display !== "none";
}

// extra = { window } ao carregar dados novos, { prepended } ao receber histórico antigo
function render(extra = {}) {
  if (!chart || !view.points) return;
  chart.update({
    asset: view.asset,
    points: view.points,
    interval: view.interval,
    mode: view.mode,
    avg: positionOf(view.asset).avg,
    orders: ordersOnChart(view.points, view.asset),
    openOrders: view.openOrders,
    projectedAvg: projectedAvg(),
    ...extra,
  });
}

// Arrastou até o começo dos dados: busca a página anterior de velas e coloca no início
async function loadOlder() {
  if (view.loadingOlder || view.reachedStart || !view.points?.length) return;
  view.loadingOlder = true;
  const { requestId, asset, interval } = view;
  const wrap = document.getElementById("price-chart-canvas-wrap");
  wrap?.classList.add("is-loading-older");
  try {
    const first = view.points[0].time;
    const data = await getKlines(asset, interval, first);
    if (requestId !== view.requestId) return; // trocou de moeda/período/vela no meio
    const older = (data.points || []).filter((p) => p.time < first);
    if (older.length < KLINES_PAGE) view.reachedStart = true;
    if (!older.length) return;
    view.points = [...older, ...view.points];
    render({ prepended: older.length });
  } catch {
    // falhou: tenta de novo no próximo arrasto
  } finally {
    if (requestId === view.requestId) {
      view.loadingOlder = false;
      wrap?.classList.remove("is-loading-older");
    }
  }
}

function setMode(mode) {
  view.mode = mode;
  writeStored(MODE_STORAGE_KEY, mode);
  highlightMode();
  render(); // mesmos dados nos dois modos: só redesenha
}

function selectInterval(interval) {
  if (interval === view.interval) return;
  view.interval = interval;
  writeStored(INTERVAL_STORAGE_KEY, interval);
  loadChart({ keepWindow: true });
}

function selectRange(range) {
  view.range = range;
  view.interval = recommendedInterval(rangeDays(range));
  writeStored(INTERVAL_STORAGE_KEY, view.interval);
  highlightRange();
  loadChart();
}

function highlightMode() {
  document.querySelectorAll("#price-chart-mode button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === view.mode);
  });
}

function highlightInterval() {
  document.querySelectorAll("#price-chart-interval button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.interval === view.interval);
  });
}

function highlightRange() {
  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === view.range);
  });
  const isCustom = !document.querySelector(`#price-chart-ranges button[data-range="${view.range}"]`);
  document.getElementById("price-chart-custom")?.classList.toggle("active", isCustom);
}

// ---------------------------------------------------------------------------
// init / abrir / fechar
// ---------------------------------------------------------------------------

export function initPriceChartModal() {
  // posições (preço médio) chegam depois dos saldos: se o modal já estiver aberto, redesenha
  on(POSITIONS_UPDATED, () => {
    if (!isOpen()) return;
    updateSimAvailability();
    updateProjectedAvailability();
    if (!view.points || state.positionsLoading) return;
    render();
    renderInfo();
  });

  initBuySimulator();

  // título "XRP / USDT ▾": troca de moeda sem fechar o modal
  picker = initAssetPicker({ getCurrent: () => view.asset, onSelect: openPriceChart });

  const container = document.getElementById("priceChartContainer");
  const wrap = document.getElementById("price-chart-canvas-wrap");
  if (container && wrap && window.LightweightCharts) {
    chart = createPriceChart(
      { container, wrap, legend: document.getElementById("price-chart-legend") },
      { onNeedOlder: loadOlder }
    );
  }

  const projectedInput = document.getElementById("price-chart-projected");
  projectedInput?.addEventListener("change", () => {
    view.showProjected = projectedInput.checked;
    writeStored(PROJECTED_STORAGE_KEY, view.showProjected ? "1" : "0");
    render();
  });

  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => selectRange(btn.dataset.range));
  });

  document.querySelectorAll("#price-chart-interval button").forEach((btn) => {
    btn.addEventListener("click", () => selectInterval(btn.dataset.interval));
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
    if (e.key !== "Escape") return;
    // com a lista de moedas aberta, o Esc fecha só a lista
    if (picker?.isOpen()) picker.close();
    else closePriceChart();
  });
}

export function openPriceChart(asset) {
  view.asset = asset;
  view.points = null;
  view.openOrders = null;
  if (!view.interval) view.interval = recommendedInterval(rangeDays(view.range));
  const modal = document.getElementById("price-chart-modal");
  if (modal) modal.style.display = "flex";

  document.getElementById("price-chart-title").innerText = `${asset} / USDT`;
  setSimContext({ asset, lastPrice: null });
  chart?.clear(); // não mostrar (esmaecido) o gráfico da moeda anterior
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
  picker?.close();
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

// ---------------------------------------------------------------------------
// carregamento
// ---------------------------------------------------------------------------

/**
 * Carrega as velas de view.interval que cobrem a janela pedida e a enquadra.
 * keepWindow: true → mantém a janela visível agora (troca de tamanho de vela).
 */
async function loadChart({ keepWindow = false } = {}) {
  const requestId = ++view.requestId;
  view.loadingOlder = false;
  view.reachedStart = false;
  const wrap = document.getElementById("price-chart-canvas-wrap");
  const error = document.getElementById("price-chart-error");
  wrap?.classList.add("is-loading");
  wrap?.classList.remove("is-loading-older");
  if (error) error.hidden = true;

  let win = (keepWindow && chart?.getVisibleWindow()) || rangeWindow(view.range);
  if (keepWindow) {
    // usuário escolheu a vela: respeita e, se a janela for grande demais pra ela, encurta a janela
    win = clampWindow(win, view.interval);
  } else {
    // janela escolhida pelo período: se a vela atual for fina demais pra ela, sobe a vela
    const fitted = fitInterval(view.interval, win.fromMs);
    if (fitted !== view.interval) {
      view.interval = fitted;
      writeStored(INTERVAL_STORAGE_KEY, fitted);
    }
  }
  const interval = view.interval;
  highlightInterval();

  try {
    // página mais recente e, se a janela começar antes dela, as anteriores (até MAX_CANDLES)
    let points = [];
    let before = null;
    let reachedStart = false;
    while (true) {
      const data = await getKlines(view.asset, interval, before);
      if (requestId !== view.requestId) return; // usuário trocou de moeda/período/vela no meio
      const page = (data.points || []).filter((p) => !points.length || p.time < points[0].time);
      points = [...page, ...points];
      if (page.length < KLINES_PAGE) {
        reachedStart = true; // veio menos que uma página: é o começo do histórico da moeda
        break;
      }
      if (points[0].time <= win.fromMs || points.length >= MAX_CANDLES) break;
      before = points[0].time;
    }

    view.points = points;
    view.reachedStart = reachedStart;
    setSimContext({ asset: view.asset, lastPrice: points.at(-1)?.close ?? null });
    updateSimAvailability();
    render({ window: win.fromMs <= 0 ? null : win });
    renderInfo();
  } catch (e) {
    if (requestId !== view.requestId) return;
    view.points = null;
    chart?.clear();
    if (error) {
      error.hidden = false;
      error.textContent = `Não foi possível carregar o gráfico: ${e.message}`;
    }
  } finally {
    if (requestId === view.requestId) wrap?.classList.remove("is-loading");
  }
}

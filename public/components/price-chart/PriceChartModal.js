import { fetchPriceChart } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { formatPrice, formatQty } from "../../core/format.js";

let chart = null;
const MODE_STORAGE_KEY = "priceChartMode";
const view = {
  asset: null,
  range: "30d",
  requestId: 0,
  lastPrice: null,
  points: null,
  interval: null,
  mode: readStoredMode(),
};
const sim = { enabled: false, x: null, y: null };

// Cache dos dados (OHLC) por moeda+período: trocar Linha/Velas nunca refaz requisição,
// e voltar a um período já visto dentro de 60s também não.
const CLIENT_CACHE_MS = 60 * 1000;
const chartCache = new Map();

async function getChartData(asset, range) {
  const key = `${asset}|${range}`;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < CLIENT_CACHE_MS) return hit.data;
  const data = await fetchPriceChart(asset, range);
  chartCache.set(key, { at: Date.now(), data });
  return data;
}

function readStoredMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "candle" ? "candle" : "line";
  } catch {
    return "line";
  }
}

function setMode(mode) {
  view.mode = mode;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {}
  highlightMode();
  if (view.points) renderChart(view.points, view.interval);
}

function highlightMode() {
  document.querySelectorAll("#price-chart-mode button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === view.mode);
  });
}

const CANDLE_UP = "rgba(82, 255, 168, 1)";
const CANDLE_DOWN = "rgba(255, 114, 114, 1)";


/**
 * Quanto comprar (em USDT, ao preço atual P) para o preço médio ir de A para T,
 * tendo hoje Q unidades:  (Q·A + X) / (Q + X/P) = T  →  X = Q·P·(T − A) / (P − T).
 * Só é possível se T estiver estritamente entre A e P.
 */
function buyToReachAvg(target) {
  const pos = state.positions?.[view.asset];
  const A = pos?.avgBuyPriceUSDT;
  const Q = pos?.qty;
  const P = view.lastPrice;
  if (!A || !Q || !P) return null;

  const lo = Math.min(A, P);
  const hi = Math.max(A, P);
  if (target <= lo || target >= hi) return { reachable: false, A, P };

  const usdt = (Q * P * (target - A)) / (P - target);
  return { reachable: true, usdt, qty: usdt / P, A, P };
}

const buyTargetPlugin = {
  id: "buyTarget",
  afterDraw(c) {
    if (!sim.enabled || sim.y === null) return;
    const { ctx, chartArea: area, scales } = c;
    if (sim.y < area.top || sim.y > area.bottom || sim.x < area.left || sim.x > area.right) return;

    const target = scales.y.getValueForPixel(sim.y);
    const r = buyToReachAvg(target);

    ctx.save();
    ctx.strokeStyle = "rgba(82, 255, 168, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(area.left, sim.y);
    ctx.lineTo(area.right, sim.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const lines = [`Preço médio alvo: ${formatPrice(target)} USDT`];
    if (!r) {
      lines.push("Sem preço médio/quantidade para simular");
    } else if (r.reachable) {
      lines.push(`Comprar ≈ ${r.usdt.toFixed(2).formatCurrency()} USDT`);
      lines.push(`(${formatQty(r.qty)} ${view.asset} a ${formatPrice(r.P)})`);
    } else {
      lines.push("Inalcançável comprando a preço atual");
      lines.push(`(precisa ficar entre ${formatPrice(Math.min(r.A, r.P))} e ${formatPrice(Math.max(r.A, r.P))})`);
    }

    ctx.font = "600 12px Manrope, sans-serif";
    const pad = 8;
    const lineH = 16;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = lines.length * lineH + pad * 2 - 4;
    let bx = sim.x + 14;
    if (bx + w > area.right) bx = sim.x - 14 - w;
    let by = sim.y - h - 10;
    if (by < area.top) by = sim.y + 10;

    ctx.fillStyle = "rgba(17, 23, 46, 0.95)";
    ctx.strokeStyle = r?.reachable ? "rgba(82, 255, 168, 0.6)" : "rgba(255, 114, 114, 0.6)";
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = "top";
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 1 ? (r?.reachable ? "#52ffa8" : "#ff7272") : "#e5ecff";
      ctx.fillText(l, bx + pad, by + pad + i * lineH);
    });
    ctx.restore();
  },
};

function setSimEnabled(enabled) {
  sim.enabled = enabled;
  if (!chart) return;
  chart.options.plugins.tooltip.enabled = !enabled;
  chart.update("none");
}

function updateSimAvailability() {
  const pos = state.positions?.[view.asset];
  const loading = state.positionsLoading;
  const ok = !loading && !!(pos?.avgBuyPriceUSDT && pos?.qty);
  const input = document.getElementById("price-chart-sim");
  const label = document.getElementById("price-chart-sim-label");
  const text = document.getElementById("price-chart-sim-text");
  if (!input || !label) return;
  input.disabled = !ok;
  label.classList.toggle("is-loading", loading);
  label.classList.toggle("disabled", !loading && !ok);
  label.title = ok || loading ? "" : "Disponível apenas para moedas com preço médio calculado";
  if (text) {
    text.textContent = loading
      ? "Calculando preço médio..."
      : "Simular compra até o preço médio do mouse";
  }
  if (!ok && input.checked) {
    input.checked = false;
    setSimEnabled(false);
  }
}

export function initPriceChartModal() {
  // posições (preço médio) chegam depois dos saldos: se o modal já estiver aberto, redesenha
  window.addEventListener("positions:updated", () => {
    const modal = document.getElementById("price-chart-modal");
    if (!modal || modal.style.display === "none") return;
    updateSimAvailability();
    if (!view.points || state.positionsLoading) return;
    renderChart(view.points, view.interval);
    if (view.points.length) renderInfo(view.points.at(-1).close);
  });

  const simInput = document.getElementById("price-chart-sim");
  simInput?.addEventListener("change", () => setSimEnabled(simInput.checked));

  const canvas = document.getElementById("priceChartCanvas");
  canvas?.addEventListener("mousemove", (e) => {
    if (!sim.enabled || !chart) return;
    sim.x = e.offsetX;
    sim.y = e.offsetY;
    chart.draw();
  });
  canvas?.addEventListener("mouseleave", () => {
    sim.x = sim.y = null;
    if (chart) chart.draw();
  });

  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      view.range = btn.dataset.range;
      highlightRange();
      loadChart();
    });
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
    view.range = `${n}${unit}`;
    highlightRange();
    loadChart();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePriceChart();
  });
}

export function openPriceChart(asset) {
  view.asset = asset;
  const modal = document.getElementById("price-chart-modal");
  if (modal) modal.style.display = "flex";

  document.getElementById("price-chart-title").innerText = `${asset} / USDT`;
  view.lastPrice = null;
  view.points = null;
  sim.x = sim.y = null;
  // não mostrar (esmaecido) o gráfico da moeda anterior
  if (chart) {
    chart.destroy();
    chart = null;
  }
  const info = document.getElementById("price-chart-info");
  if (info) info.innerHTML = "";
  updateSimAvailability();
  highlightRange();
  loadChart();
}

export function closePriceChart() {
  const modal = document.getElementById("price-chart-modal");
  if (modal) modal.style.display = "none";
}

export function closePriceChartOnBackdrop(event) {
  if (event.target.id === "price-chart-modal") closePriceChart();
}

function highlightRange() {
  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === view.range);
  });
  const isCustom = !document.querySelector(`#price-chart-ranges button[data-range="${view.range}"]`);
  document.getElementById("price-chart-custom")?.classList.toggle("active", isCustom);
}

function renderInfo(lastPrice) {
  const info = document.getElementById("price-chart-info");
  if (!info) return;

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

    const points = data.points || [];
    view.lastPrice = points.length ? points.at(-1).close : null;
    view.points = points;
    view.interval = data.interval;
    updateSimAvailability();
    renderChart(points, data.interval);
    if (points.length) renderInfo(points.at(-1).close);
  } catch (e) {
    if (requestId !== view.requestId) return;
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (error) {
      error.hidden = false;
      error.textContent = `Não foi possível carregar o gráfico: ${e.message}`;
    }
  } finally {
    if (requestId === view.requestId) wrap?.classList.remove("is-loading");
  }
}

function formatLabel(time, interval) {
  const date = new Date(time);
  if (interval === "1h" || interval === "4h") {
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR");
}

function renderChart(points, interval) {
  const ctx = document.getElementById("priceChartCanvas");
  if (!ctx) return;

  const avg = state.positions?.[view.asset]?.avgBuyPriceUSDT ?? null;
  const labels = points.map((p) => formatLabel(p.time, interval));
  const candle = view.mode === "candle";
  const datasets = [
    candle
      ? {
          type: "bar",
          label: `${view.asset} (USDT)`,
          ohlc: points,
          // corpo da vela = barra flutuante de abertura até fechamento
          data: points.map((p) => [p.open, p.close]),
          backgroundColor: points.map((p) => (p.close >= p.open ? CANDLE_UP : CANDLE_DOWN)),
          borderColor: points.map((p) => (p.close >= p.open ? CANDLE_UP : CANDLE_DOWN)),
          borderWidth: 0,
          borderSkipped: false,
          minBarLength: 1,
          categoryPercentage: 0.9,
          barPercentage: 0.8,
          grouped: false,
          order: 1,
        }
      : {
          label: `${view.asset} (USDT)`,
          data: points.map((p) => p.close),
          borderColor: "rgba(77, 212, 255, 1)",
          backgroundColor: "rgba(77, 212, 255, 0.12)",
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.15,
        },
  ];

  // Pavio (mínima → máxima) como barra fina sobreposta, atrás do corpo:
  // assim anima junto com as velas em vez de aparecer pronto antes delas.
  if (candle) {
    datasets.push({
      type: "bar",
      label: "Pavio",
      isWick: true,
      data: points.map((p) => [p.low, p.high]),
      backgroundColor: points.map((p) => (p.close >= p.open ? CANDLE_UP : CANDLE_DOWN)),
      borderWidth: 0,
      barThickness: 1,
      grouped: false,
      order: 2,
    });
  }

  if (avg !== null) {
    datasets.push({
      label: "Seu preço médio",
      data: points.map(() => avg),
      borderColor: "rgba(247, 147, 26, 0.95)",
      borderWidth: 2,
      borderDash: [6, 6],
      pointRadius: 0,
      fill: false,
    });
  }

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    plugins: [buyTargetPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: "#e5ecff",
            font: { family: "Manrope" },
            filter: (item, data) => !data.datasets[item.datasetIndex]?.isWick,
          },
        },
        tooltip: {
          enabled: !sim.enabled,
          filter: (item) => !item.dataset.isWick,
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context) => {
              const p = context.dataset.ohlc?.[context.dataIndex];
              if (p) {
                const chg = p.open ? ((p.close - p.open) / p.open) * 100 : 0;
                return [
                  ` Abertura: ${formatPrice(p.open)}`,
                  ` Máxima: ${formatPrice(p.high)}`,
                  ` Mínima: ${formatPrice(p.low)}`,
                  ` Fechamento: ${formatPrice(p.close)} (${chg >= 0 ? "+" : ""}${chg.toFixed(2).formatCurrency()}%)`,
                ];
              }
              return ` ${context.dataset.label}: ${formatPrice(context.parsed.y)} USDT`;
            },
          },
        },
      },
      scales: {
        x: {
          offset: candle,
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#9bb0d6", maxTicksLimit: 8, font: { family: "Manrope", size: 11 } },
        },
        y: {
          beginAtZero: false,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "#9bb0d6",
            font: { family: "Manrope", size: 11 },
            callback: (value) => formatPrice(value),
          },
        },
      },
    },
  });
}

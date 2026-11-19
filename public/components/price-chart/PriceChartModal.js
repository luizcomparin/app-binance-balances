import { fetchPriceChart } from "../../api/binance.js";
import { state } from "../../core/state.js";
import { formatPrice } from "../../core/format.js";

let chart = null;
const view = { asset: null, range: "30d", requestId: 0 };

export function initPriceChartModal() {
  document.querySelectorAll("#price-chart-ranges button").forEach((btn) => {
    btn.addEventListener("click", () => {
      view.range = btn.dataset.range;
      highlightRange();
      loadChart();
    });
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
  document.querySelectorAll("#price-chart-ranges button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === view.range);
  });
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
  const loading = document.getElementById("price-chart-loading");
  const error = document.getElementById("price-chart-error");
  if (loading) loading.hidden = false;
  if (error) error.hidden = true;

  try {
    const data = await fetchPriceChart(view.asset, view.range);
    if (requestId !== view.requestId) return; // usuário trocou de período/moeda no meio

    const points = data.points || [];
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
    if (requestId === view.requestId && loading) loading.hidden = true;
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
  const datasets = [
    {
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#e5ecff", font: { family: "Manrope" } },
        },
        tooltip: {
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context) => ` ${context.dataset.label}: ${formatPrice(context.parsed.y)} USDT`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#9bb0d6", maxTicksLimit: 8, font: { family: "Manrope", size: 11 } },
        },
        y: {
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

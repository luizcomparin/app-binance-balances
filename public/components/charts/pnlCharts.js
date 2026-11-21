// Gráficos de resultado na aba "Gráficos de Distribuição" (dados de /positions, os mesmos de Saldos):
//   - P&L por moeda: barras para a direita (lucro, verde) e para a esquerda (prejuízo, vermelho);
//   - Custo vs. valor atual: quanto cada moeda custou e quanto vale hoje, lado a lado.
// Só entram moedas com preço médio conhecido (sem o USDT).
import { state } from "../../core/state.js";
import { on, POSITIONS_UPDATED } from "../../core/events.js";
import { AXIS_TICKS, brlOf, createTopToggle, fitBarHeight, fmt2, GRID, LABEL_TICKS, openOnClick, pct1, TOOLTIP_STYLE } from "./chartUtils.js";

const TOP = 15;
const GAIN = "rgba(82, 255, 168, 0.75)";
const LOSS = "rgba(255, 114, 114, 0.75)";
const COST = "rgba(155, 176, 214, 0.45)";

let pnlChart = null;
let costChart = null;
let pnlTop = null;
let costTop = null;

export function initPnlCharts() {
  pnlTop = createTopToggle("pnlChartToggle", TOP, renderPnlChart);
  costTop = createTopToggle("costChartToggle", TOP, renderCostChart);
  on(POSITIONS_UPDATED, () => {
    renderStatus();
    if (state.positionsLoading || state.positionsError) return;
    renderPnlChart();
    renderCostChart();
  });
}

// moedas com custo conhecido e valor de mercado (o P&L delas é calculável)
function positionsWithCost() {
  return Object.values(state.positions || {}).filter(
    (p) => p.asset !== "USDT" && p.costBasisUSDT && p.marketValueUSDT !== null && p.unrealizedPnlUSDT !== null
  );
}

// "Calculando P&L..." / erro, no lugar dos dois gráficos
function renderStatus() {
  const msg = state.positionsLoading
    ? "Calculando P&L... (busca o histórico de trades)"
    : state.positionsError
      ? `Não foi possível calcular o P&L: ${state.positionsError}`
      : "";
  for (const id of ["pnlChartStatus", "costChartStatus"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.toggle("error", !!state.positionsError && !state.positionsLoading);
  }
}

// escreve o valor no fim de cada barra (direita no lucro, esquerda no prejuízo)
const pnlLabels = {
  id: "pnlLabels",
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, scales } = chart;
    ctx.save();
    ctx.font = "600 12px Manrope, sans-serif";
    ctx.textBaseline = "middle";
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const p = opts.items[i];
      if (!p) return;
      const text = `${p.unrealizedPnlUSDT >= 0 ? "+" : ""}${fmt2(p.unrealizedPnlUSDT)} (${pct1(p.unrealizedPnlPct ?? 0)})`;
      const end = scales.x.getPixelForValue(p.unrealizedPnlUSDT);
      const gain = p.unrealizedPnlUSDT >= 0;
      ctx.fillStyle = gain ? "#52ffa8" : "#ff7272";
      ctx.textAlign = gain ? "left" : "right";
      ctx.fillText(text, end + (gain ? 8 : -8), bar.y);
    });
    ctx.restore();
  },
};

function renderPnlChart() {
  const canvas = document.getElementById("pnlChart");
  if (!canvas || !pnlTop) return;
  // maiores resultados (em módulo) primeiro no corte; exibidos do maior lucro ao maior prejuízo
  const byImpact = positionsWithCost().sort((a, b) => Math.abs(b.unrealizedPnlUSDT) - Math.abs(a.unrealizedPnlUSDT));
  const items = pnlTop.slice(byImpact).sort((a, b) => b.unrealizedPnlUSDT - a.unrealizedPnlUSDT);
  fitBarHeight("pnlChartWrap", items.length);

  pnlChart?.destroy();
  pnlChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: items.map((p) => p.asset),
      datasets: [
        {
          data: items.map((p) => p.unrealizedPnlUSDT),
          backgroundColor: items.map((p) => (p.unrealizedPnlUSDT >= 0 ? GAIN : LOSS)),
          borderRadius: 5,
          borderSkipped: false,
        },
      ],
    },
    plugins: [pnlLabels],
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false, axis: "y" }, // clique/dica em qualquer ponto da linha
      ...openOnClick((i) => items[i]?.asset),
      plugins: {
        legend: { display: false },
        pnlLabels: { items },
        tooltip: {
          ...TOOLTIP_STYLE,
          displayColors: false,
          callbacks: {
            label: (context) => {
              const p = items[context.dataIndex];
              return [
                ` P&L: ${p.unrealizedPnlUSDT >= 0 ? "+" : ""}${fmt2(p.unrealizedPnlUSDT)} USDT (${pct1(p.unrealizedPnlPct ?? 0)})`,
                ` Custo: ${fmt2(p.costBasisUSDT)} USDT`,
                ` Valor hoje: ${fmt2(p.marketValueUSDT)} USDT`,
                ` BRL: ${brlOf(p.unrealizedPnlUSDT)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          grace: "30%", // espaço para o valor escrito nas pontas
          grid: { ...GRID, color: (c) => (c.tick.value === 0 ? "rgba(255, 255, 255, 0.25)" : GRID.color) },
          ticks: AXIS_TICKS,
        },
        y: { grid: { display: false }, ticks: LABEL_TICKS },
      },
    },
  });
}

function renderCostChart() {
  const canvas = document.getElementById("costChart");
  if (!canvas || !costTop) return;
  const items = costTop.slice(positionsWithCost().sort((a, b) => b.costBasisUSDT - a.costBasisUSDT));
  fitBarHeight("costChartWrap", items.length, 40);

  costChart?.destroy();
  costChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: items.map((p) => p.asset),
      datasets: [
        { label: "Custo", data: items.map((p) => p.costBasisUSDT), backgroundColor: COST, borderRadius: 4, borderSkipped: false },
        {
          label: "Valor hoje",
          data: items.map((p) => p.marketValueUSDT),
          backgroundColor: items.map((p) => (p.marketValueUSDT >= p.costBasisUSDT ? GAIN : LOSS)),
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false, axis: "y" },
      ...openOnClick((i) => items[i]?.asset),
      plugins: {
        legend: { display: false }, // legenda própria acima do gráfico
        tooltip: {
          ...TOOLTIP_STYLE,
          displayColors: false,
          filter: (item) => item.datasetIndex === 0, // um bloco só por moeda
          callbacks: {
            label: (context) => {
              const p = items[context.dataIndex];
              return [
                ` Custo: ${fmt2(p.costBasisUSDT)} USDT`,
                ` Valor hoje: ${fmt2(p.marketValueUSDT)} USDT`,
                ` P&L: ${p.unrealizedPnlUSDT >= 0 ? "+" : ""}${fmt2(p.unrealizedPnlUSDT)} USDT (${pct1(p.unrealizedPnlPct ?? 0)})`,
              ];
            },
          },
        },
      },
      scales: {
        x: { grid: GRID, ticks: AXIS_TICKS },
        y: { grid: { display: false }, ticks: LABEL_TICKS },
      },
    },
  });
}

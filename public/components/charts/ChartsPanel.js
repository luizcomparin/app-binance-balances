import { state } from "../../core/state.js";

import { BALANCES_UPDATED, on } from "../../core/events.js";
import { brlOf, fmt2 } from "./chartUtils.js";
import { initPnlCharts } from "./pnlCharts.js";

let walletChart = null;
let walletBarChart = null;

export function initChartsPanel() {
  on(BALANCES_UPDATED, (data) => {
    renderWalletChart(data.assets);
    renderWalletBarChart(data.assets);
  });
  initPnlCharts();
  document.getElementById("walletBarToggle")?.addEventListener("click", () => {
    showAllBars = !showAllBars;
    renderWalletBarChart(lastAssets);
  });
}

// moedas com cor própria (destaque fixo, intencional); as demais entram em "Outros"
const HIGHLIGHT = [
  ["USDT", "rgba(77, 212, 255, 0.8)"],
  ["BTC", "rgba(247, 147, 26, 0.8)"],
  ["XRP", "rgba(107, 242, 197, 0.8)"],
  ["ETH", "rgba(138, 43, 226, 0.8)"],
];
const OTHERS_COLOR = "rgba(155, 176, 214, 0.8)";
const OTHERS_IN_TOOLTIP = 8; // moedas de "Outros" listadas na dica da fatia


// fatias: as moedas em destaque e "Outros" (com as moedas que ele junta, da maior para a menor)
function distributionSlices(assets) {
  const slices = [];
  for (const [symbol, color] of HIGHLIGHT) {
    const a = assets.find((x) => x.asset === symbol);
    if (a && a.pct > 0) slices.push({ label: symbol, pct: a.pct, usdt: a.totalUSDT, color });
  }
  const highlighted = new Set(HIGHLIGHT.map(([s]) => s));
  const members = assets.filter((a) => !highlighted.has(a.asset) && a.pct > 0).sort((a, b) => b.totalUSDT - a.totalUSDT);
  if (members.length) {
    slices.push({
      label: "Outros",
      pct: members.reduce((acc, a) => acc + a.pct, 0),
      usdt: members.reduce((acc, a) => acc + a.totalUSDT, 0),
      color: OTHERS_COLOR,
      members,
    });
  }
  return slices;
}

// legenda ao lado da rosca: nome, % e valor de cada fatia
function renderLegend(slices) {
  const el = document.getElementById("walletLegend");
  if (!el) return;
  el.innerHTML = slices
    .map(
      (s) => `
        <li>
          <i class="dist-swatch" style="background: ${s.color}"></i>
          <span class="dist-name">${s.label}${s.members ? ` <small>(${s.members.length} moedas)</small>` : ""}</span>
          <span class="dist-pct">${s.pct.toFixed(2).replace(".", ",")}%</span>
          <span class="dist-usdt">${fmt2(s.usdt)} USDT</span>
        </li>`
    )
    .join("");
}

// total no meio da rosca, desenhado no próprio canvas (antes da dica: a dica fica por cima dele)
const donutCenter = {
  id: "donutCenter",
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea } = chart;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#9bb0d6";
    ctx.font = "700 11px Manrope, sans-serif";
    ctx.fillText("TOTAL", x, y - 24);
    ctx.fillStyle = "#e5ecff";
    ctx.font = "800 20px Manrope, sans-serif";
    ctx.fillText(opts.total, x, y);
    if (opts.brl) {
      ctx.fillStyle = "#9bb0d6";
      ctx.font = "500 12px Manrope, sans-serif";
      ctx.fillText(opts.brl, x, y + 22);
    }
    ctx.restore();
  },
};

export function renderWalletChart(assets) {
  const ctx = document.getElementById("walletChart");
  if (!ctx) return;

  const slices = distributionSlices(assets);
  renderLegend(slices);

  // total da carteira no meio da rosca
  const total = assets.reduce((acc, a) => acc + a.totalUSDT, 0);
  const center = { total: `${fmt2(total)} USDT`, brl: state.usdtBrlPrice ? brlOf(total) : "" };

  if (walletChart) {
    walletChart.destroy();
  }

  walletChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.pct),
          backgroundColor: slices.map((s) => s.color),
          borderColor: "#11172e",
          borderWidth: 3,
        },
      ],
    },
    plugins: [donutCenter],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "64%",
      plugins: {
        donutCenter: center,
        legend: { display: false }, // legenda própria, com % e valor
        tooltip: {
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context) => {
              const s = slices[context.dataIndex];
              const lines = [` ${s.label}: ${s.pct.toFixed(2)}%`, ` USDT: ${fmt2(s.usdt)} USDT`, ` BRL: ${brlOf(s.usdt)}`];
              // "Outros": quais moedas estão ali dentro
              if (s.members) {
                lines.push("");
                for (const a of s.members.slice(0, OTHERS_IN_TOOLTIP)) lines.push(` ${a.asset}: ${a.pct.toFixed(2)}%`);
                const rest = s.members.length - OTHERS_IN_TOOLTIP;
                if (rest > 0) lines.push(` + ${rest} moedas`);
              }
              return lines;
            },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// valores por moeda: barra dividida em livre (cor cheia) e em ordens (mesma cor, mais clara),
// com o valor escrito dentro da barra quando cabe (senão logo depois dela)
// ---------------------------------------------------------------------------

const TOP_BARS = 15; // sem "mostrar todas", só as maiores
let showAllBars = false;
let lastAssets = [];

const lighter = (rgba) => rgba.replace(/[\d.]+\)$/, "0.32)");

// escreve "1.053,34 USDT · 28,1%" no fim de cada barra
const barValueLabels = {
  id: "barValueLabels",
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, scales } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "600 12px Manrope, sans-serif";
    ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => {
      const item = opts.items[i];
      if (!item) return;
      const text = `${fmt2(item.total)} USDT · ${item.pct.toFixed(1).replace(".", ",")}%`;
      const start = scales.x.getPixelForValue(0);
      const freeEnd = scales.x.getPixelForValue(item.free);
      const end = scales.x.getPixelForValue(item.total);
      const width = ctx.measureText(text).width;
      if (freeEnd - start > width + 20) {
        // cabe dentro da parte livre (cor cheia): texto escuro no fim dela
        ctx.fillStyle = "#0b1024";
        ctx.textAlign = "right";
        ctx.fillText(text, freeEnd - 10, bar.y);
      } else {
        ctx.fillStyle = "#c9d6f2";
        ctx.textAlign = "left";
        ctx.fillText(text, end + 8, bar.y);
      }
    });
    ctx.restore();
  },
};

export function renderWalletBarChart(assets) {
  const ctx = document.getElementById("walletBarChart");
  if (!ctx) return;
  lastAssets = assets;

  const allSorted = [...assets].filter((a) => a.totalUSDT > 0).sort((a, b) => b.totalUSDT - a.totalUSDT);
  const sortedAssets = showAllBars ? allSorted : allSorted.slice(0, TOP_BARS);
  const totalWalletUsdt = assets.reduce((acc, a) => acc + a.totalUSDT, 0);
  const pctOf = (v) => (totalWalletUsdt ? (v / totalWalletUsdt) * 100 : 0);

  const colorOf = new Map(HIGHLIGHT);
  const colors = sortedAssets.map((a) => colorOf.get(a.asset) || OTHERS_COLOR);
  const items = sortedAssets.map((a) => ({ total: a.totalUSDT, free: a.freeUSDT, pct: pctOf(a.totalUSDT) }));

  // botão "mostrar todas / só as maiores" (só aparece se houver mais moedas que o limite)
  const toggle = document.getElementById("walletBarToggle");
  if (toggle) {
    toggle.hidden = allSorted.length <= TOP_BARS;
    toggle.textContent = showAllBars ? `Mostrar só as ${TOP_BARS} maiores` : `Mostrar todas (${allSorted.length})`;
  }

  // altura acompanha a quantidade de moedas (~28px por barra)
  const wrap = document.getElementById("walletBarWrap");
  if (wrap) wrap.style.height = `${Math.max(240, sortedAssets.length * 28 + 40)}px`;

  if (walletBarChart) {
    walletBarChart.destroy();
  }

  const bar = { borderColor: "#11172e", borderWidth: 1, borderRadius: 5, borderSkipped: false };

  walletBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedAssets.map((a) => a.asset),
      datasets: [
        { label: "Livre", data: sortedAssets.map((a) => a.freeUSDT), backgroundColor: colors, ...bar },
        { label: "Em ordens", data: sortedAssets.map((a) => a.lockedUSDT), backgroundColor: colors.map(lighter), ...bar },
      ],
    },
    plugins: [barValueLabels],
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false, axis: "y" },
      plugins: {
        legend: { display: false },
        barValueLabels: { items },
        tooltip: {
          backgroundColor: "#11172e",
          titleColor: "#4dd4ff",
          bodyColor: "#e5ecff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          // um bloco só por moeda (os dois pedaços da barra juntos)
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            label: (context) => {
              const a = sortedAssets[context.dataIndex];
              return [
                ` Total: ${fmt2(a.totalUSDT)} USDT (${pctOf(a.totalUSDT).toFixed(2)}%)`,
                ` Livre: ${fmt2(a.freeUSDT)} USDT`,
                ` Em ordens: ${fmt2(a.lockedUSDT)} USDT`,
                ` BRL: ${brlOf(a.totalUSDT)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grace: "8%", // espaço para o valor escrito depois das barras pequenas
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#9bb0d6", font: { size: 11, family: "Manrope" } },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: "#e5ecff", font: { size: 12, family: "Manrope", weight: "600" } },
        },
      },
    },
  });
}

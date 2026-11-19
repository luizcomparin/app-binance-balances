// Simulador "quanto comprar para o preço médio chegar na posição do mouse".
import { state } from "../../core/state.js";
import { formatPrice, formatQty } from "../../core/format.js";

const sim = { enabled: false, x: null, y: null };
// moeda/preço atual do gráfico aberto e acesso à instância do Chart.js (definidos pelo modal)
const context = { asset: null, lastPrice: null, getChart: () => null };

export function setSimContext({ asset, lastPrice }) {
  context.asset = asset;
  context.lastPrice = lastPrice;
}

export function isSimEnabled() {
  return sim.enabled;
}

export function resetSimPointer() {
  sim.x = sim.y = null;
}

/**
 * Quanto comprar (em USDT, ao preço atual P) para o preço médio ir de A para T,
 * tendo hoje Q unidades:  (Q·A + X) / (Q + X/P) = T  →  X = Q·P·(T − A) / (P − T).
 * Só é possível se T estiver estritamente entre A e P.
 */
export function buyToReachAvg(target, { avg: A, qty: Q, price: P }) {
  if (!A || !Q || !P) return null;

  const lo = Math.min(A, P);
  const hi = Math.max(A, P);
  if (target <= lo || target >= hi) return { reachable: false, A, P };

  const usdt = (Q * P * (target - A)) / (P - target);
  return { reachable: true, usdt, qty: usdt / P, A, P };
}

export const buyTargetPlugin = {
  id: "buyTarget",
  afterDraw(c) {
    if (!sim.enabled || sim.y === null) return;
    const { ctx, chartArea: area, scales } = c;
    if (sim.y < area.top || sim.y > area.bottom || sim.x < area.left || sim.x > area.right) return;

    const target = scales.y.getValueForPixel(sim.y);
    const pos = state.positions?.[context.asset];
    const r = buyToReachAvg(target, { avg: pos?.avgBuyPriceUSDT, qty: pos?.qty, price: context.lastPrice });

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
      lines.push(`(${formatQty(r.qty)} ${context.asset} a ${formatPrice(r.P)})`);
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
  const chart = context.getChart();
  if (!chart) return;
  // o tooltip normal atrapalha a leitura da caixa do simulador
  chart.options.plugins.tooltip.enabled = !enabled;
  chart.update("none");
}

// Checkbox: spinner enquanto o preço médio é calculado, desabilitado sem preço médio
export function updateSimAvailability() {
  const pos = state.positions?.[context.asset];
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
    text.textContent = loading ? "Calculando preço médio..." : "Simular compra até o preço médio do mouse";
  }
  if (!ok && input.checked) {
    input.checked = false;
    setSimEnabled(false);
  }
}

export function initBuySimulator(getChart) {
  context.getChart = getChart;

  const simInput = document.getElementById("price-chart-sim");
  simInput?.addEventListener("change", () => setSimEnabled(simInput.checked));

  const canvas = document.getElementById("priceChartCanvas");
  canvas?.addEventListener("mousemove", (e) => {
    const chart = getChart();
    if (!sim.enabled || !chart) return;
    sim.x = e.offsetX;
    sim.y = e.offsetY;
    chart.draw();
  });
  canvas?.addEventListener("mouseleave", () => {
    resetSimPointer();
    getChart()?.draw();
  });
}

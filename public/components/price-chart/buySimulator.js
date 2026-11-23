// Simulador "quanto comprar para o preço médio chegar na posição do mouse" + contas de preço médio.
import { state } from "../../core/state.js";
import { formatPrice, formatQty } from "../../core/format.js";

const STORAGE_KEY = "priceChartSimulator"; // checkbox "Simular compra até o preço médio" marcado?
// wanted = escolha da pessoa (salva); enabled = ativo de fato (marcado e com preço médio na moeda aberta)
const sim = { wanted: readWanted(), enabled: false };

function readWanted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
// moeda/preço atual do gráfico aberto (definidos pelo modal)
const context = { asset: null, lastPrice: null };

export function setSimContext({ asset, lastPrice }) {
  context.asset = asset;
  context.lastPrice = lastPrice;
}

export function isSimEnabled() {
  return sim.enabled;
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

/**
 * Preço médio depois de executar compras a preços definidos (ex.: ordens de compra abertas):
 * (Q·A + Σ qtdᵢ·preçoᵢ) / (Q + Σ qtdᵢ). Mesma conta do simulador, com várias compras.
 * Taxas não entram. Retorna null sem posição ou sem compras.
 */
export function avgAfterBuys({ avg: A, qty: Q }, buys) {
  if (!A || !Q || !buys?.length) return null;
  let cost = Q * A;
  let qty = Q;
  for (const b of buys) {
    cost += b.qty * b.priceUSDT;
    qty += b.qty;
  }
  return cost / qty;
}

/**
 * Preço médio de venda depois de executar vendas a preços definidos (ex.: ordens de venda abertas):
 * (S·V + Σ qtdᵢ·preçoᵢ) / (S + Σ qtdᵢ), com S = quantidade já vendida no ciclo e V = preço médio de venda.
 * Sem vendas no ciclo, é a média das vendas abertas. Taxas não entram. Retorna null sem vendas abertas.
 */
export function avgAfterSells({ avgSell: V, soldQty: S }, sells) {
  if (!sells?.length) return null;
  let value = V && S ? S * V : 0;
  let qty = V && S ? S : 0;
  for (const s of sells) {
    value += s.qty * s.priceUSDT;
    qty += s.qty;
  }
  return qty > 0 ? value / qty : null;
}

/**
 * Conteúdo da caixa do simulador para o preço sob o mouse.
 * Retorna { lines: [texto...], status: "ok" | "unreachable" | "none" }.
 */
export function simBox(target) {
  const pos = state.positions?.[context.asset];
  const r = buyToReachAvg(target, { avg: pos?.avgBuyPriceUSDT, qty: pos?.qty, price: context.lastPrice });

  const lines = [`Preço médio alvo: ${formatPrice(target)} USDT`];
  if (!r) {
    lines.push("Sem preço médio/quantidade para simular");
    return { lines, status: "none" };
  }
  if (r.reachable) {
    lines.push(`Comprar ≈ ${r.usdt.toFixed(2).formatCurrency()} USDT`);
    lines.push(`(${formatQty(r.qty)} ${context.asset} a ${formatPrice(r.P)})`);
    return { lines, status: "ok" };
  }
  lines.push("Inalcançável comprando a preço atual");
  lines.push(`(precisa ficar entre ${formatPrice(Math.min(r.A, r.P))} e ${formatPrice(Math.max(r.A, r.P))})`);
  return { lines, status: "unreachable" };
}

// Checkbox: spinner enquanto o preço médio é calculado, desabilitado sem preço médio
// explicação do item no hover (quando disponível)
const SIM_TITLE = "Ao passar o mouse sobre um preço do gráfico, mostra quanto comprar ao preço atual para o seu preço médio chegar nele";

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
  label.title = ok || loading ? SIM_TITLE : "Disponível apenas para moedas com preço médio calculado";
  if (text) {
    text.textContent = loading ? "Calculando preço médio..." : "Simular compra até o preço médio";
  }
  // sem preço médio (ou carregando) fica desmarcado, mas a escolha salva continua e volta a valer
  sim.enabled = ok && sim.wanted;
  input.checked = sim.enabled;
}

export function initBuySimulator() {
  const simInput = document.getElementById("price-chart-sim");
  if (simInput) simInput.checked = sim.enabled;
  simInput?.addEventListener("change", () => {
    sim.wanted = sim.enabled = simInput.checked;
    try {
      localStorage.setItem(STORAGE_KEY, sim.wanted ? "1" : "0");
    } catch {
      // sem armazenamento: vale só até recarregar
    }
  });
}

// Sinais de compra e venda no cabeçalho do gráfico de preço: campo resumido (tendência D/S e região)
// que abre uma janelinha flutuante com os detalhes. A conta fica em signals.js (pura); aqui ficam a
// carga das velas diárias e semanais (sempre essas, qualquer que seja a vela na tela) e o desenho.
// Documentação: docs/sinais/.

import { escapeHtml } from "../../../core/dom.js";
import { getKlines, KLINES_PAGE } from "../chartData.js";
import { pairLabel } from "../chartQuote.js";
import { analyzeSignals } from "./signals.js";

// velas diárias: até 3 páginas (cerca de 8 anos), para o percentil da esticagem ter histórico
const DAILY_PAGES = 3;

// asset: moeda mostrada; result: resposta de analyzeSignals; error: motivo da falha; loading: carga em andamento
const view = { asset: null, requestId: 0, result: null, error: null, loading: false };

const el = (id) => document.getElementById(id);

async function loadDaily(asset) {
  let points = [];
  let before = null;
  for (let page = 0; page < DAILY_PAGES; page++) {
    const data = await getKlines(asset, "1d", before);
    const got = data.points || [];
    points = got.concat(points);
    if (got.length < KLINES_PAGE) break; // página incompleta: chegou ao início do histórico
    before = got[0].time;
  }
  return points;
}

/** Carrega as velas D e S da moeda e calcula os sinais. Chamada na troca de moeda e no Atualizar do topo. */
export async function loadSignals(asset) {
  const requestId = ++view.requestId;
  // na troca de moeda some o resultado anterior; no Atualizar ele continua na tela até o novo chegar
  if (view.asset !== asset) view.result = null;
  view.asset = asset;
  view.error = null;
  view.loading = true;
  render();
  try {
    const [daily, weekly] = await Promise.all([loadDaily(asset), getKlines(asset, "1w").then((d) => d.points || [])]);
    if (requestId !== view.requestId) return;
    view.result = analyzeSignals({ asset, daily, weekly, now: Date.now() });
  } catch (err) {
    if (requestId !== view.requestId) return;
    view.result = null;
    view.error = err?.message || "erro desconhecido";
  }
  view.loading = false;
  render();
}

const TREND = {
  up: { arrow: "▲", name: "alta", cls: "pos" },
  down: { arrow: "▼", name: "baixa", cls: "neg" },
  side: { arrow: "▬", name: "lateral", cls: "flat" },
};

const trendChip = (label, title, side) => {
  const t = TREND[side];
  if (!t) return `<span class="pcs-chip off" title="Tendência ${title}: histórico insuficiente">${label} –</span>`;
  return `<span class="pcs-chip ${t.cls}" title="Tendência ${title}: ${t.name}">${label} ${t.arrow}</span>`;
};

function regionChip(region) {
  if (!region.of) return `<span class="pcs-chip off" title="Nenhum sinal de fundo ou topo disponível">sem dados</span>`;
  const title = `Sinais de fundo: ${region.bottom} · de topo: ${region.top} · disponíveis: ${region.of}`;
  if (region.side === "bottom") return `<span class="pcs-chip pos" title="${title}">Fundo provável ${region.bottom}/${region.of}</span>`;
  if (region.side === "top") return `<span class="pcs-chip neg" title="${title}">Topo provável ${region.top}/${region.of}</span>`;
  return `<span class="pcs-chip flat" title="${title}">Região neutra</span>`;
}

function summaryHtml() {
  if (view.result) {
    const { trend, region } = view.result;
    const busy = view.loading ? `<span class="mini-spinner"></span>` : "";
    return trendChip("D", "diária", trend.d) + trendChip("S", "semanal", trend.w) + regionChip(region) + busy;
  }
  if (view.loading) return `<span class="pcs-pending"><span class="mini-spinner"></span> analisando...</span>`;
  if (view.error) return `<span class="pcs-chip off" title="${escapeHtml(view.error)}">indisponíveis</span>`;
  return "";
}

// bolinha do sinal: verde = fundo/alta, vermelha = topo/baixa, apagada = inativo, vazada = indisponível
function dotClass(s) {
  if (!s.available) return "none";
  if (!s.active) return "off";
  return s.side === "bottom" || s.side === "up" ? "pos" : "neg";
}

const signalRow = (s) =>
  `<li class="pcs-row${s.available ? "" : " unavailable"}"><span class="pcs-dot ${dotClass(s)}"></span><span>${escapeHtml(s.text)}</span></li>`;

function popHtml() {
  const title = `<div class="pcs-title">Sinais · ${escapeHtml(pairLabel(view.asset, " / "))}</div>`;
  if (!view.result) {
    if (view.error) {
      return `${title}<p class="pcs-note">Não foi possível calcular os sinais (${escapeHtml(view.error)}).</p>
        <button type="button" class="pc-btn" id="price-chart-signals-retry">Tentar de novo</button>`;
    }
    return `${title}<p class="pcs-note"><span class="mini-spinner"></span> Carregando as velas diárias e semanais...</p>`;
  }

  const { signals, region, generatedAt } = view.result;
  const group = (name) => signals.filter((s) => s.group === name).map(signalRow).join("");
  const score = region.of
    ? `fundo ${region.bottom} · topo ${region.top} · de ${region.of} ${region.of === 1 ? "disponível" : "disponíveis"}`
    : "nenhum sinal disponível";
  const time = new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${title}
    <div class="pcs-group">Tendência</div>
    <ul class="pcs-list">${group("trend")}</ul>
    <div class="pcs-group">Fundo ou topo <span class="pcs-score">${score}</span></div>
    <ul class="pcs-list">${group("extreme")}</ul>
    <p class="pcs-note">Calculado às ${time} com as velas diárias e semanais, qualquer que seja a vela do gráfico.
      Não é previsão nem recomendação: mostra só quais sinais estão presentes agora.</p>`;
}

function render() {
  const wrap = el("price-chart-signals");
  const summary = el("price-chart-signals-summary");
  const pop = el("price-chart-signals-pop");
  if (!wrap || !summary || !pop) return;
  wrap.hidden = !view.asset;
  summary.innerHTML = summaryHtml();
  pop.innerHTML = view.asset ? popHtml() : "";
}

/** Liga o campo do cabeçalho: clique abre/fecha a janela; clique fora ou Esc fecha. */
export function initSignalsPanel() {
  const wrap = el("price-chart-signals");
  const btn = el("price-chart-signals-btn");
  const pop = el("price-chart-signals-pop");
  if (!wrap || !btn || !pop) return;

  const setOpen = (open) => {
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => setOpen(pop.hidden));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#price-chart-signals")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  pop.addEventListener("click", (e) => {
    if (e.target.closest("#price-chart-signals-retry") && view.asset) loadSignals(view.asset);
  });
}

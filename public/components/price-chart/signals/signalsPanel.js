// Sinais de compra e venda no cabeçalho do gráfico de preço: campo resumido (tendência D/S e região)
// que abre uma janelinha flutuante com os detalhes. A conta fica em signals.js (pura); aqui ficam a
// carga das velas diárias e semanais (sempre essas, qualquer que seja a vela na tela), a do Fear & Greed
// Index, a das fontes opcionais dos futuros (funding e liquidações reais) e o desenho.
// Documentação: docs/sinais/.

import { fetchFearGreed, fetchFuturesData, fetchLiquidations } from "../../../api/binance.js";
import { escapeHtml } from "../../../core/dom.js";
import { COINALYZE_KEY_CHANGED, on } from "../../../core/events.js";
import { getKlines, KLINES_PAGE } from "../chartData.js";
import { pairLabel } from "../chartQuote.js";
import { analyzeSignals, SIGNAL_FAMILIES } from "./signals.js";

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

// Fear & Greed Index: é do mercado, então uma carga serve a todas as moedas (10 min, como o server).
// Fonte fora do ar não derruba os outros sinais: devolve null e o sinal fica "indisponível".
const FNG_CACHE_MS = 10 * 60 * 1000;
const fng = { at: 0, rows: null, loading: null };

function loadFearGreedRows({ fresh = false } = {}) {
  if (!fresh && fng.rows && Date.now() - fng.at < FNG_CACHE_MS) return Promise.resolve(fng.rows);
  if (fng.loading) return fng.loading;
  fng.loading = fetchFearGreed()
    .then((data) => {
      if (!data?.available) return fng.rows; // falhou: fica com o que já tinha (o sinal confere se está velho)
      fng.rows = data.rows || [];
      fng.at = Date.now();
      return fng.rows;
    })
    .catch(() => fng.rows)
    .finally(() => {
      fng.loading = null;
    });
  return fng.loading;
}

// Fontes opcionais, por moeda: funding (Binance Futures) e liquidações reais (Coinalyze), sempre em dias.
// Devolvem { rows } ou { reason } e nunca derrubam os outros sinais. Os dados são diários e mudam devagar,
// então o cache do cliente é longo: trocar de moeda várias vezes não gasta o limite da Coinalyze (cada
// moeda custa uma chamada por corretora). Só ficam em cache as respostas com dados e os "não existe"
// (sem contrato); sem chave ou com erro, tenta de novo na próxima vez.
const OPTIONAL_CACHE_MS = { funding: 10 * 60 * 1000, liquidations: 30 * 60 * 1000 };
const KEEP_REASONS = ["no-perpetual", "no-market"];
const optionalCache = new Map();

async function loadOptional(kind, asset, fetcher, pick, fresh) {
  const key = `${kind}|${asset}`;
  const hit = optionalCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < OPTIONAL_CACHE_MS[kind]) return hit.data;
  let data;
  try {
    const res = await fetcher();
    data = res?.available ? { rows: pick(res) || [] } : { reason: res?.reason || "error", message: res?.message };
  } catch (err) {
    data = { reason: "error", message: err?.message };
  }
  if (data.rows || KEEP_REASONS.includes(data.reason)) optionalCache.set(key, { at: Date.now(), data });
  return data;
}

const loadFunding = (asset, fresh) => loadOptional("funding", asset, () => fetchFuturesData(asset, "1d"), (res) => res.funding, fresh);
const loadLiquidations = (asset, fresh) =>
  loadOptional("liquidations", asset, () => fetchLiquidations(asset, "1d"), (res) => res.rows, fresh);

/**
 * Carrega as velas D e S da moeda, o Fear & Greed, o funding e as liquidações e calcula os sinais. Chamada
 * na troca de moeda e no Atualizar do topo (fresh: busca tudo de novo, sem usar os caches deste módulo).
 */
export async function loadSignals(asset, { fresh = false } = {}) {
  const requestId = ++view.requestId;
  // na troca de moeda some o resultado anterior; no Atualizar ele continua na tela até o novo chegar
  if (view.asset !== asset) view.result = null;
  view.asset = asset;
  view.error = null;
  view.loading = true;
  render();
  try {
    const [daily, weekly, fearGreed, funding, liquidations] = await Promise.all([
      loadDaily(asset),
      getKlines(asset, "1w").then((d) => d.points || []),
      loadFearGreedRows({ fresh }),
      loadFunding(asset, fresh),
      loadLiquidations(asset, fresh),
    ]);
    if (requestId !== view.requestId) return;
    view.result = analyzeSignals({ asset, daily, weekly, fearGreed, funding, liquidations, now: Date.now() });
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
  // o placar conta grupos de sinais (RSI, divergência, esticagem, sentimento, futuros), não sinais soltos
  const title = `Grupos de sinais apontando fundo: ${region.bottom} · topo: ${region.top} · disponíveis: ${region.of}`;
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
    ? `grupos: fundo ${region.bottom} · topo ${region.top} · de ${region.of} ${region.of === 1 ? "disponível" : "disponíveis"}`
    : "nenhum sinal disponível";
  // sinais de fundo/topo separados por família: cada uma conta uma vez só no placar
  const families = SIGNAL_FAMILIES.map((f) => {
    const rows = signals.filter((s) => s.family === f.key);
    const side = ["bottom", "top"].find((x) => rows.some((s) => s.available && s.active && s.side === x));
    const mark = side ? `<span class="pcs-family-mark ${side === "bottom" ? "pos" : "neg"}">${side === "bottom" ? "fundo" : "topo"}</span>` : "";
    return `<li class="pcs-family">${f.label}${mark}</li>${rows.map(signalRow).join("")}`;
  }).join("");
  const time = new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${title}
    <div class="pcs-group">Tendência</div>
    <ul class="pcs-list">${group("trend")}</ul>
    <div class="pcs-group">Fundo ou topo <span class="pcs-score">${score}</span></div>
    <ul class="pcs-list">${families}</ul>
    <p class="pcs-note">"Fundo provável" ou "topo provável" aparece quando 3 ou mais grupos apontam o mesmo lado
      e no máximo 1 aponta o contrário. Calculado às ${time} com as velas diárias e semanais, qualquer que seja a
      vela do gráfico. Não é previsão nem recomendação: mostra só quais sinais estão presentes agora.</p>`;
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
  // chave da Coinalyze salva ou removida: o sinal de liquidações muda (o cache dele só guarda respostas boas)
  on(COINALYZE_KEY_CHANGED, () => {
    for (const key of optionalCache.keys()) if (key.startsWith("liquidations|")) optionalCache.delete(key);
    if (view.asset) loadSignals(view.asset);
  });
}

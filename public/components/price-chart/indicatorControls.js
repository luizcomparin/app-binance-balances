// Controles dos indicadores (linha "Indicadores" do cabeçalho): médias móveis e Bandas de Bollinger.
// Dá para adicionar vários; cada um tem cor (com opacidade), parâmetros, ocultar/exibir e remover.
// A lista fica salva no navegador.
//   média móvel:  { kind: "ma", period, type: "SMA"|"EMA", color, opacity, visible }
//   Bollinger:    { kind: "bb", period, mult (desvios padrão), color, opacity, visible }
import { maColor } from "./chart/movingAverage.js";

const STORAGE_KEY = "priceChartIndicators";
const LEGACY_MA_KEY = "priceChartMovingAverages"; // antes só havia médias móveis
const MIN_PERIOD = 2;
const MAX_PERIOD = 1000; // uma página de velas de aquecimento
const MIN_MULT = 0.5;
const MAX_MULT = 5;
const DEFAULT_PERIODS = [20, 50, 100, 200];
const PALETTE = ["#ffd166", "#ef476f", "#06d6a0", "#a78bfa", "#f78c6b", "#e5ecff"];
const BB_COLOR = "#4dabf7";

const EYE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></svg>';

let list = readList();
let el = null;
let onChange = () => {};

function clampPeriod(n) {
  return Math.min(MAX_PERIOD, Math.max(MIN_PERIOD, Math.round(Number(n) || 0)));
}

function clampMult(n) {
  const v = Math.round((Number(n) || 2) * 10) / 10;
  return Math.min(MAX_MULT, Math.max(MIN_MULT, v));
}

function clampOpacity(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0.05, n)) : 1;
}

function normalize(m) {
  const base = {
    id: m.id,
    kind: m.kind === "bb" ? "bb" : "ma",
    period: clampPeriod(m.period),
    color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : PALETTE[0],
    opacity: clampOpacity(m.opacity ?? 1),
    visible: m.visible !== false,
  };
  return base.kind === "bb" ? { ...base, mult: clampMult(m.mult) } : { ...base, type: m.type === "EMA" ? "EMA" : "SMA" };
}

function readList() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_MA_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((m) => m && typeof m.id === "string").map(normalize);
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    localStorage.removeItem(LEGACY_MA_KEY);
  } catch {}
}

// indicadores configurados (inclusive os ocultos)
export function getIndicators() {
  return list;
}

const newId = (kind) => `${kind}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

function swatchHtml(m) {
  return `<button type="button" class="pcm-swatch" title="Cor e opacidade"><i style="background:${maColor(m)}"></i></button>
    <div class="pcm-pop" hidden>
      <label class="pcm-opacity-row">
        <span>Opacidade</span>
        <input type="range" class="pcm-opacity" min="5" max="100" step="5" value="${Math.round(m.opacity * 100)}" />
        <b class="pcm-opacity-value">${Math.round(m.opacity * 100)}%</b>
      </label>
      <input type="color" class="pcm-color" value="${m.color}" title="Clique para escolher a cor (clique de novo para fechar)" />
    </div>`;
}

function paramsHtml(m) {
  const period = `<input type="number" class="pcm-period" min="${MIN_PERIOD}" max="${MAX_PERIOD}" step="1" value="${m.period}" title="Período (quantidade de velas)" />`;
  if (m.kind === "bb") {
    return `<span class="pcm-kind" title="Bandas de Bollinger: média de ${m.period} velas ± ${String(m.mult).replace(".", ",")} desvios padrão">BB</span>
      ${period}
      <label class="pcm-mult-wrap" title="Largura das bandas, em desvios padrão">
        <input type="number" class="pcm-mult" min="${MIN_MULT}" max="${MAX_MULT}" step="0.1" value="${m.mult}" /><span>σ</span>
      </label>`;
  }
  return `<select class="pcm-type" title="Tipo: simples (SMA) ou exponencial (EMA)">
      <option value="SMA"${m.type === "SMA" ? " selected" : ""}>SMA</option>
      <option value="EMA"${m.type === "EMA" ? " selected" : ""}>EMA</option>
    </select>
    ${period}`;
}

function render() {
  if (!el) return;
  const items = list
    .map(
      (m) => `<div class="pcm-item${m.visible ? "" : " off"}" data-id="${m.id}">
        ${swatchHtml(m)}
        ${paramsHtml(m)}
        <button type="button" class="pcm-btn pcm-eye" title="${m.visible ? "Ocultar" : "Exibir"}">${m.visible ? EYE : EYE_OFF}</button>
        <button type="button" class="pcm-btn pcm-remove" title="Remover">×</button>
      </div>`
    )
    .join("");
  el.innerHTML = `<span class="pcm-label">Indicadores</span>${items}
    <button type="button" class="ghost pcm-add" data-kind="ma">+ Média móvel</button>
    <button type="button" class="ghost pcm-add" data-kind="bb">+ Bollinger</button>`;
}

// ---------------------------------------------------------------------------
// ações
// ---------------------------------------------------------------------------

function update(id, changes) {
  list = list.map((m) => (m.id === id ? { ...m, ...changes } : m));
  save();
  onChange();
}

function add(kind) {
  if (kind === "bb") {
    list = [...list, { id: newId("bb"), kind: "bb", period: 20, mult: 2, color: BB_COLOR, opacity: 1, visible: true }];
  } else {
    const mas = list.filter((m) => m.kind === "ma");
    const used = new Set(mas.map((m) => m.period));
    const usedColors = new Set(list.map((m) => m.color));
    list = [
      ...list,
      {
        id: newId("ma"),
        kind: "ma",
        period: DEFAULT_PERIODS.find((p) => !used.has(p)) || 20,
        type: "SMA",
        color: PALETTE.find((c) => !usedColors.has(c)) || PALETTE[mas.length % PALETTE.length],
        opacity: 1,
        visible: true,
      },
    ];
  }
  save();
  render();
  onChange();
}

function closePopovers() {
  el?.querySelectorAll(".pcm-pop").forEach((p) => (p.hidden = true));
}

/** Liga os controles ao elemento. handlers.onChange() é chamado a cada mudança. */
export function initIndicatorControls(container, handlers = {}) {
  el = container;
  onChange = handlers.onChange || onChange;
  if (!el) return;
  render();

  el.addEventListener("click", (e) => {
    const addBtn = e.target.closest(".pcm-add");
    if (addBtn) return add(addBtn.dataset.kind);
    const item = e.target.closest(".pcm-item");
    if (!item) return;
    const id = item.dataset.id;
    // barra de cor = liga/desliga do seletor do navegador: com ele aberto, o clique só fecha
    // (o navegador fecha o seletor no mousedown e, sem isso, o click o abriria de novo)
    const colorInput = e.target.closest(".pcm-color");
    if (colorInput) {
      if (colorInput.dataset.open === "1") {
        e.preventDefault();
        colorInput.dataset.open = "";
      } else {
        colorInput.dataset.open = "1";
      }
      return;
    }
    // bolinha de cor: abre/fecha o painel de cor + opacidade (só um aberto por vez)
    if (e.target.closest(".pcm-swatch")) {
      const pop = item.querySelector(".pcm-pop");
      const open = pop.hidden;
      closePopovers();
      pop.hidden = !open;
      return;
    }
    if (e.target.closest(".pcm-remove")) {
      list = list.filter((m) => m.id !== id);
      save();
      render();
      return onChange();
    }
    if (e.target.closest(".pcm-eye")) {
      const visible = !list.find((m) => m.id === id)?.visible;
      update(id, { visible });
      render();
    }
  });

  // cor e opacidade: atualizam enquanto escolhe (sem redesenhar a lista, para o painel continuar aberto)
  el.addEventListener("input", (e) => {
    const item = e.target.closest(".pcm-item");
    if (!item) return;
    if (e.target.classList.contains("pcm-color")) update(item.dataset.id, { color: e.target.value });
    else if (e.target.classList.contains("pcm-opacity")) {
      update(item.dataset.id, { opacity: clampOpacity(Number(e.target.value) / 100) });
      item.querySelector(".pcm-opacity-value").textContent = `${e.target.value}%`;
    } else return;
    const m = list.find((x) => x.id === item.dataset.id);
    if (m) item.querySelector(".pcm-swatch i").style.background = maColor(m);
  });

  // o seletor de cor fechou por outro caminho (clicou fora da barra, Esc): o próximo clique abre.
  // (não usa "change": o Chrome o dispara no mousedown que fecha o seletor, antes do click)
  const pickerClosed = (e) => {
    if (e.target.classList?.contains("pcm-color")) e.target.dataset.open = "";
  };
  el.addEventListener("focusout", pickerClosed);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") pickerClosed(e);
  });

  // clique fora ou Esc fecha o painel de cor
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".pcm-swatch, .pcm-pop")) closePopovers();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopovers();
  });

  // tipo, período e desvios: ao confirmar (Enter/sair do campo)
  el.addEventListener("change", (e) => {
    const item = e.target.closest(".pcm-item");
    const id = item?.dataset.id;
    if (!id) return;
    if (e.target.classList.contains("pcm-type")) update(id, { type: e.target.value });
    if (e.target.classList.contains("pcm-period")) {
      const period = clampPeriod(e.target.value);
      e.target.value = period;
      update(id, { period });
    }
    if (e.target.classList.contains("pcm-mult")) {
      const mult = clampMult(e.target.value);
      e.target.value = mult;
      update(id, { mult });
    }
  });
}

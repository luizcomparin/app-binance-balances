// Configurações dos painéis de Volume, CVD/Delta e RSI, que abrem pela engrenagem no título de cada painel
// (chart/futuresPanes.js cria a engrenagem e a caixa; aqui se preenche a caixa). Ligar/desligar cada
// painel fica nas Camadas ("Painéis abaixo do gráfico").
//   Volume: médias móveis do volume (lista de pílulas, como a dos indicadores do preço)
//   CVD:    { type: "CVD" (linha acumulada) | "DELTA" (histograma por vela), color, opacity }
//   RSI:    { period, overbought, oversold, color, opacity } (limites em chart/rsi.js → normalizeRsiSettings)
import { normalizeRsiSettings } from "./chart/rsi.js";
import { clampOpacity, handleColorClick, initVolumeAverageControls, watchColorPickerClose } from "./indicatorControls.js";

const CVD_STORAGE_KEY = "priceChartCvd";
const RSI_STORAGE_KEY = "priceChartRsi";
const LEGACY_INDICATORS_KEY = "priceChartIndicators"; // o CVD já foi um item da lista de indicadores
const CVD_DEFAULT = { type: "CVD", color: "#4dd4ff", opacity: 1 };

function normalizeCvd(c) {
  return {
    type: c?.type === "DELTA" ? "DELTA" : "CVD",
    color: /^#[0-9a-f]{6}$/i.test(c?.color) ? c.color : CVD_DEFAULT.color,
    opacity: clampOpacity(c?.opacity ?? 1),
  };
}

// o CVD que estava na lista de indicadores (antes de virar painel das Camadas), ou null
function legacyCvd() {
  try {
    const list = JSON.parse(localStorage.getItem(LEGACY_INDICATORS_KEY) || "[]");
    return Array.isArray(list) ? list.find((m) => m?.kind === "cvd") || null : null;
  } catch {
    return null;
  }
}

function readCvd() {
  try {
    const raw = localStorage.getItem(CVD_STORAGE_KEY);
    if (raw) return normalizeCvd(JSON.parse(raw));
  } catch {}
  return normalizeCvd(legacyCvd() || CVD_DEFAULT);
}

function saveCvd() {
  try {
    localStorage.setItem(CVD_STORAGE_KEY, JSON.stringify(cvd));
  } catch {}
}

let cvd = readCvd();
// herdou do indicador antigo: grava já na chave nova (a lista de indicadores pode ser regravada sem ele)
try {
  if (!localStorage.getItem(CVD_STORAGE_KEY) && legacyCvd()) saveCvd();
} catch {}

/** configurações do painel de CVD ({ type, color, opacity }) */
export const getCvdSettings = () => cvd;

/** o CVD estava ligado como indicador (versão anterior)? Vale como padrão do checkbox nas Camadas */
export const legacyCvdOn = () => legacyCvd()?.visible === true;

function cvdHtml() {
  const pct = Math.round(cvd.opacity * 100);
  return `<span class="pcm-pop-title">CVD / Delta de volume</span>
    <div class="price-chart-mas fps-form">
      <label class="pcm-field"><span>Mostrar</span><select class="fps-cvd-type" title="Acumulado (CVD) ou o saldo de cada vela (Delta)">
        <option value="CVD"${cvd.type === "CVD" ? " selected" : ""}>CVD (acumulado)</option>
        <option value="DELTA"${cvd.type === "DELTA" ? " selected" : ""}>Delta por vela</option>
      </select></label>
      <label class="pcm-opacity-row">
        <span>Opacidade</span>
        <input type="range" class="pcm-opacity fps-cvd-opacity" min="5" max="100" step="5" value="${pct}" />
        <b class="pcm-opacity-value">${pct}%</b>
      </label>
      <label class="pcm-field fps-color-field" title="Cor da linha do CVD (no Delta, as barras são verdes/vermelhas)">
        <span>Cor da linha</span>
        <input type="color" class="pcm-color fps-cvd-color" value="${cvd.color}" title="Clique para escolher a cor (clique de novo para fechar)" />
      </label>
    </div>`;
}

function mountCvd(el, onChange) {
  el.innerHTML = cvdHtml();
  const set = (changes) => {
    cvd = normalizeCvd({ ...cvd, ...changes });
    saveCvd();
    onChange();
  };
  el.addEventListener("click", (e) => handleColorClick(e, ".fps-cvd-color"));
  watchColorPickerClose(el, "fps-cvd-color");
  el.addEventListener("input", (e) => {
    if (e.target.classList.contains("fps-cvd-color")) set({ color: e.target.value });
    else if (e.target.classList.contains("fps-cvd-opacity")) {
      set({ opacity: Number(e.target.value) / 100 });
      el.querySelector(".pcm-opacity-value").textContent = `${e.target.value}%`;
    }
  });
  el.addEventListener("change", (e) => {
    if (e.target.classList.contains("fps-cvd-type")) set({ type: e.target.value });
  });
}

// ---- RSI ----

function readRsi() {
  try {
    return normalizeRsiSettings(JSON.parse(localStorage.getItem(RSI_STORAGE_KEY) || "null"));
  } catch {
    return normalizeRsiSettings(null);
  }
}

let rsiSettings = readRsi();

/** configurações do painel do RSI ({ period, overbought, oversold, color, opacity }) */
export const getRsiSettings = () => rsiSettings;

function rsiHtml() {
  const r = rsiSettings;
  const pct = Math.round(r.opacity * 100);
  const num = (cls, value, min, max, title) =>
    `<input type="number" class="${cls}" min="${min}" max="${max}" step="1" value="${value}" title="${title}" />`;
  return `<span class="pcm-pop-title">RSI (Índice de Força Relativa)</span>
    <div class="price-chart-mas fps-form">
      <label class="pcm-field"><span>Período</span>${num("fps-rsi-period", r.period, 2, 100, "Quantidade de velas (2 a 100; o padrão é 14)")}</label>
      <label class="pcm-field"><span>Sobrecompra</span>${num("fps-rsi-overbought", r.overbought, 51, 99, "Linha de cima (51 a 99; o padrão é 70)")}</label>
      <label class="pcm-field"><span>Sobrevenda</span>${num("fps-rsi-oversold", r.oversold, 1, 49, "Linha de baixo (1 a 49; o padrão é 30)")}</label>
      <label class="pcm-opacity-row">
        <span>Opacidade</span>
        <input type="range" class="pcm-opacity fps-rsi-opacity" min="5" max="100" step="5" value="${pct}" />
        <b class="pcm-opacity-value">${pct}%</b>
      </label>
      <label class="pcm-field fps-color-field" title="Cor da linha do RSI">
        <span>Cor da linha</span>
        <input type="color" class="pcm-color fps-rsi-color" value="${r.color}" title="Clique para escolher a cor (clique de novo para fechar)" />
      </label>
    </div>`;
}

function mountRsi(el, onChange) {
  el.innerHTML = rsiHtml();
  const set = (changes) => {
    rsiSettings = normalizeRsiSettings({ ...rsiSettings, ...changes });
    try {
      localStorage.setItem(RSI_STORAGE_KEY, JSON.stringify(rsiSettings));
    } catch {}
    onChange();
  };
  el.addEventListener("click", (e) => handleColorClick(e, ".fps-rsi-color"));
  watchColorPickerClose(el, "fps-rsi-color");
  el.addEventListener("input", (e) => {
    if (e.target.classList.contains("fps-rsi-color")) set({ color: e.target.value });
    else if (e.target.classList.contains("fps-rsi-opacity")) {
      set({ opacity: Number(e.target.value) / 100 });
      el.querySelector(".pcm-opacity-value").textContent = `${e.target.value}%`;
    }
  });
  // números: ao confirmar (Enter/sair do campo); o campo mostra o valor já dentro dos limites
  const fields = { "fps-rsi-period": "period", "fps-rsi-overbought": "overbought", "fps-rsi-oversold": "oversold" };
  el.addEventListener("change", (e) => {
    const key = fields[[...e.target.classList].find((c) => fields[c])];
    if (!key) return;
    set({ [key]: e.target.value });
    e.target.value = rsiSettings[key];
  });
}

function mountVolume(el, onChange) {
  el.innerHTML = `<span class="pcm-pop-title">Volume</span>
    <span class="fps-label">Médias móveis do volume</span>
    <div class="price-chart-mas fps-list"></div>`;
  initVolumeAverageControls(el.querySelector(".fps-list"), { onChange });
}

/** Preenche a caixa de configurações do painel key ("volume" | "cvd" | "rsi"); onChange() a cada mudança */
export function mountPaneSettings(key, el, onChange) {
  if (key === "volume") mountVolume(el, onChange);
  else if (key === "cvd") mountCvd(el, onChange);
  else if (key === "rsi") mountRsi(el, onChange);
}

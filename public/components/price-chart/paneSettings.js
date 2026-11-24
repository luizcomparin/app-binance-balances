// Configurações dos painéis de Volume, CVD/Delta e RSI, que abrem pela engrenagem no título de cada painel
// (chart/futuresPanes.js cria a engrenagem e a caixa; aqui se preenche a caixa). Ligar/desligar cada
// painel fica nas Camadas ("Painéis abaixo do gráfico").
//   Volume: médias móveis do volume (lista de pílulas, como a dos indicadores do preço)
//   CVD:    { type: "CVD" (linha acumulada) | "DELTA" (histograma por vela), color, opacity }
//   RSI:    período, níveis, cor e opacidade; média móvel do RSI; aparência das linhas de nível
//           (campos e limites em chart/rsi.js → RSI_DEFAULT e normalizeRsiSettings)
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

// campos do formulário do RSI: cada controle tem data-k = chave das configurações
//   número: ao confirmar (Enter/sair do campo); select e checkbox: ao mudar; cor e faixas: enquanto escolhe
function rsiHtml() {
  const r = rsiSettings;
  const num = (k, min, max, title) =>
    `<input type="number" data-k="${k}" min="${min}" max="${max}" step="1" value="${r[k]}" title="${title}" />`;
  const color = (k, title) =>
    `<input type="color" class="pcm-color" data-k="${k}" value="${r[k]}" title="${title} (clique de novo para fechar)" />`;
  const range = (k, label) => {
    const pct = Math.round(r[k] * 100);
    return `<label class="pcm-opacity-row">
        <span>${label}</span>
        <input type="range" class="pcm-opacity" data-k="${k}" min="5" max="100" step="5" value="${pct}" />
        <b class="pcm-opacity-value">${pct}%</b>
      </label>`;
  };
  const select = (k, options, title) =>
    `<select data-k="${k}" title="${title}">${options
      .map(([v, label]) => `<option value="${v}"${String(r[k]) === String(v) ? " selected" : ""}>${label}</option>`)
      .join("")}</select>`;
  const check = (k, label, title) =>
    `<label class="fps-check" title="${title}"><input type="checkbox" data-k="${k}"${r[k] ? " checked" : ""} /><span>${label}</span></label>`;
  return `<span class="pcm-pop-title">RSI (Índice de Força Relativa)</span>
    <div class="price-chart-mas fps-form">
      <label class="pcm-field"><span>Período</span>${num("period", 2, 100, "Quantidade de velas (2 a 100; o padrão é 14)")}</label>
      ${range("opacity", "Opacidade")}
      <label class="pcm-field fps-color-field"><span>Cor da linha</span>${color("color", "Cor da linha do RSI")}</label>

      <span class="fps-section">Média móvel do RSI</span>
      ${check("maOn", "Mostrar a média móvel", "Linha com a média dos valores do RSI (suaviza o RSI; cruzamentos indicam mudança de força)")}
      <label class="pcm-field"><span>Tipo</span>${select("maType", [["SMA", "SMA (simples)"], ["EMA", "EMA (exponencial)"]], "Simples (SMA) ou exponencial (EMA)")}</label>
      <label class="pcm-field"><span>Período</span>${num("maPeriod", 2, 100, "Quantidade de valores do RSI na média (2 a 100; o padrão é 14)")}</label>
      <label class="pcm-field fps-color-field"><span>Cor</span>${color("maColor", "Cor da média móvel do RSI")}</label>

      <span class="fps-section">Linhas de sobrecompra e sobrevenda</span>
      <label class="pcm-field"><span>Sobrecompra</span><span class="fps-pair">${num("overbought", 51, 99, "Nível da linha de cima (51 a 99; o padrão é 70)")}${color("overboughtColor", "Cor da linha de sobrecompra")}</span></label>
      <label class="pcm-field"><span>Sobrevenda</span><span class="fps-pair">${num("oversold", 1, 49, "Nível da linha de baixo (1 a 49; o padrão é 30)")}${color("oversoldColor", "Cor da linha de sobrevenda")}</span></label>
      <label class="pcm-field"><span>Estilo</span>${select("lineStyle", [["dashed", "Tracejada"], ["dotted", "Pontilhada"], ["solid", "Sólida"]], "Estilo das linhas de nível")}</label>
      <label class="pcm-field"><span>Espessura</span>${select("lineWidth", [[1, "1 px"], [2, "2 px"], [3, "3 px"], [4, "4 px"]], "Espessura das linhas de nível")}</label>
      ${range("levelOpacity", "Opacidade")}
      ${check("showMid", "Linha do meio (50)", "Linha pontilhada em 50: acima, altas mais fortes; abaixo, baixas mais fortes")}
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
  el.addEventListener("click", (e) => handleColorClick(e, ".pcm-color"));
  watchColorPickerClose(el, "pcm-color");
  // cor e faixas de opacidade: enquanto escolhe
  el.addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    if (e.target.type === "color") set({ [k]: e.target.value });
    else if (e.target.type === "range") {
      set({ [k]: Number(e.target.value) / 100 });
      e.target.closest(".pcm-opacity-row").querySelector(".pcm-opacity-value").textContent = `${e.target.value}%`;
    }
  });
  // números (ao confirmar), selects e checkboxes; o campo mostra o valor já dentro dos limites
  el.addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (!k || e.target.type === "color" || e.target.type === "range") return;
    set({ [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    if (e.target.type === "number") e.target.value = rsiSettings[k];
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

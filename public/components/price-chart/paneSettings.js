// Configurações dos painéis de Volume, CVD/Delta, RSI e MACD, que abrem pela engrenagem no título de cada painel
// (chart/futuresPanes.js cria a engrenagem e a caixa; aqui se preenche a caixa). Ligar/desligar cada
// painel fica nas Camadas ("Painéis abaixo do gráfico").
//   Volume: médias móveis do volume (lista de pílulas, como a dos indicadores do preço)
//   CVD:    { type: "CVD" (linha acumulada) | "DELTA" (histograma por vela), color, opacity }
//   RSI:    período, níveis, cor e opacidade; média móvel do RSI; aparência das linhas de nível
//           (campos e limites em chart/rsi.js → RSI_DEFAULT e normalizeRsiSettings)
//   MACD:   médias rápida/lenta/sinal e tipos, cores das linhas e do histograma
//           (campos e limites em chart/macd.js → MACD_DEFAULT e normalizeMacdSettings)
import { normalizeRsiSettings } from "./chart/rsi.js";
import { normalizeMacdSettings } from "./chart/macd.js";
import { clampOpacity, handleColorClick, initVolumeAverageControls, watchColorPickerClose } from "./indicatorControls.js";

const CVD_STORAGE_KEY = "priceChartCvd";
const RSI_STORAGE_KEY = "priceChartRsi";
const MACD_STORAGE_KEY = "priceChartMacd";
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

// ---- formulários com campos data-k (RSI e MACD) ----
// Cada controle tem data-k = chave das configurações. Número: vale ao confirmar (Enter/sair do campo);
// select e checkbox: ao mudar; cor e faixas de opacidade: enquanto escolhe.

/** construtores de campos sobre as configurações atuais (values) */
function fieldBuilders(values) {
  return {
    num: (k, min, max, title) =>
      `<input type="number" data-k="${k}" min="${min}" max="${max}" step="1" value="${values[k]}" title="${title}" />`,
    color: (k, title) =>
      `<input type="color" class="pcm-color" data-k="${k}" value="${values[k]}" title="${title} (clique de novo para fechar)" />`,
    range: (k, label) => {
      const pct = Math.round(values[k] * 100);
      return `<label class="pcm-opacity-row">
        <span>${label}</span>
        <input type="range" class="pcm-opacity" data-k="${k}" min="5" max="100" step="5" value="${pct}" />
        <b class="pcm-opacity-value">${pct}%</b>
      </label>`;
    },
    select: (k, options, title) =>
      `<select data-k="${k}" title="${title}">${options
        .map(([v, label]) => `<option value="${v}"${String(values[k]) === String(v) ? " selected" : ""}>${label}</option>`)
        .join("")}</select>`,
    check: (k, label, title) =>
      `<label class="fps-check" title="${title}"><input type="checkbox" data-k="${k}"${values[k] ? " checked" : ""} /><span>${label}</span></label>`,
  };
}

/**
 * Liga um formulário de campos data-k: el recebe html; set(changes) aplica e devolve as configurações
 * normalizadas (o campo numérico mostra o valor já dentro dos limites).
 */
function mountKeyedForm(el, html, set) {
  el.innerHTML = html;
  el.addEventListener("click", (e) => handleColorClick(e, ".pcm-color"));
  watchColorPickerClose(el, "pcm-color");
  el.addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    if (e.target.type === "color") set({ [k]: e.target.value });
    else if (e.target.type === "range") {
      set({ [k]: Number(e.target.value) / 100 });
      e.target.closest(".pcm-opacity-row").querySelector(".pcm-opacity-value").textContent = `${e.target.value}%`;
    }
  });
  el.addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (!k || e.target.type === "color" || e.target.type === "range") return;
    const values = set({ [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    if (e.target.type === "number") e.target.value = values[k];
  });
}

const MA_TYPES = [["SMA", "SMA (simples)"], ["EMA", "EMA (exponencial)"]];

/** configurações guardadas em key, normalizadas (sem nada salvo ou com erro: o padrão) */
function readSettings(key, normalize) {
  try {
    return normalize(JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return normalize(null);
  }
}

function writeSettings(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {}
}

// ---- RSI ----

let rsiSettings = readSettings(RSI_STORAGE_KEY, normalizeRsiSettings);

/** configurações do painel do RSI (chart/rsi.js → RSI_DEFAULT) */
export const getRsiSettings = () => rsiSettings;

function rsiHtml() {
  const { num, color, range, select, check } = fieldBuilders(rsiSettings);
  return `<span class="pcm-pop-title">RSI (Índice de Força Relativa)</span>
    <div class="price-chart-mas fps-form">
      <label class="pcm-field"><span>Período</span>${num("period", 2, 100, "Quantidade de velas (2 a 100; o padrão é 14)")}</label>
      ${range("opacity", "Opacidade")}
      <label class="pcm-field fps-color-field"><span>Cor da linha</span>${color("color", "Cor da linha do RSI")}</label>

      <span class="fps-section">Média móvel do RSI</span>
      ${check("maOn", "Mostrar a média móvel", "Linha com a média dos valores do RSI (suaviza o RSI; cruzamentos indicam mudança de força)")}
      <label class="pcm-field"><span>Tipo</span>${select("maType", MA_TYPES, "Simples (SMA) ou exponencial (EMA)")}</label>
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
  mountKeyedForm(el, rsiHtml(), (changes) => {
    rsiSettings = normalizeRsiSettings({ ...rsiSettings, ...changes });
    writeSettings(RSI_STORAGE_KEY, rsiSettings);
    onChange();
    return rsiSettings;
  });
}

// ---- MACD ----

let macdSettings = readSettings(MACD_STORAGE_KEY, normalizeMacdSettings);

/** configurações do painel do MACD (chart/macd.js → MACD_DEFAULT) */
export const getMacdSettings = () => macdSettings;

function macdHtml() {
  const { num, color, range, select, check } = fieldBuilders(macdSettings);
  return `<span class="pcm-pop-title">MACD</span>
    <div class="price-chart-mas fps-form">
      <label class="pcm-field"><span>Média rápida</span>${num("fast", 2, 100, "Velas da média rápida (2 a 100; o padrão é 12)")}</label>
      <label class="pcm-field"><span>Média lenta</span>${num("slow", 2, 200, "Velas da média lenta (2 a 200; o padrão é 26)")}</label>
      <label class="pcm-field"><span>Tipo das médias</span>${select("oscType", MA_TYPES, "Médias rápida e lenta: exponencial (EMA, o padrão) ou simples (SMA)")}</label>
      <label class="pcm-field"><span>Sinal</span>${num("signal", 1, 100, "Valores do MACD na média da linha de sinal (1 a 100; o padrão é 9)")}</label>
      <label class="pcm-field"><span>Tipo do sinal</span>${select("signalType", MA_TYPES, "Linha de sinal: exponencial (EMA, o padrão) ou simples (SMA)")}</label>

      <span class="fps-section">Linhas</span>
      <label class="pcm-field fps-color-field"><span>Cor do MACD</span>${color("macdColor", "Cor da linha MACD")}</label>
      <label class="pcm-field fps-color-field"><span>Cor do sinal</span>${color("signalColor", "Cor da linha de sinal")}</label>

      <span class="fps-section">Histograma</span>
      ${check("showHist", "Mostrar o histograma", "Barras com MACD − sinal (tom mais claro quando a força diminui)")}
      <label class="pcm-field fps-color-field"><span>Cor acima de zero</span>${color("histUpColor", "Cor das barras acima de zero")}</label>
      <label class="pcm-field fps-color-field"><span>Cor abaixo de zero</span>${color("histDownColor", "Cor das barras abaixo de zero")}</label>
      ${range("histOpacity", "Opacidade")}
    </div>`;
}

function mountMacd(el, onChange) {
  mountKeyedForm(el, macdHtml(), (changes) => {
    macdSettings = normalizeMacdSettings({ ...macdSettings, ...changes });
    writeSettings(MACD_STORAGE_KEY, macdSettings);
    onChange();
    return macdSettings;
  });
}

function mountVolume(el, onChange) {
  el.innerHTML = `<span class="pcm-pop-title">Volume</span>
    <span class="fps-label">Médias móveis do volume</span>
    <div class="price-chart-mas fps-list"></div>`;
  initVolumeAverageControls(el.querySelector(".fps-list"), { onChange });
}

/** Preenche a caixa de configurações do painel key ("volume" | "cvd" | "rsi" | "macd"); onChange() a cada mudança */
export function mountPaneSettings(key, el, onChange) {
  if (key === "volume") mountVolume(el, onChange);
  else if (key === "cvd") mountCvd(el, onChange);
  else if (key === "rsi") mountRsi(el, onChange);
  else if (key === "macd") mountMacd(el, onChange);
}

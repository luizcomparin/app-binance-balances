// Aba "Gráfico de preço": moeda, tamanho da vela, período, modo Linha/Velas, opções e carregamento.
//
// Como no TradingView, são dois controles (regras em timeframe.js):
//   - tamanho da vela (1h · 4h · D · S · M): redesenha mantendo a janela de tempo que está na tela;
//   - período (7d, 30d, ..., Tudo, customizado): mostra essa janela e escolhe a vela recomendada.
import { state } from "../../core/state.js";
import { formatPrice } from "../../core/format.js";
import { on, POSITIONS_UPDATED, TAB_CHANGED } from "../../core/events.js";
import { isTabActive, showTab } from "../tabs/Tabs.js";
import { getKlines, KLINES_PAGE, loadMyOrders, loadOpenOrders, ordersOnChart } from "./chartData.js";
import { createPriceChart } from "./chart/createChart.js";
import { avgAfterBuys, initBuySimulator, setSimContext, updateSimAvailability } from "./buySimulator.js";
import { initAssetPicker } from "./assetPicker.js";
import { buysOf, dcaComparison } from "./dca.js";
import { annualizedPct, dailyVolatility, priceBand, touchProbability } from "./volatility.js";
import {
  clampWindow,
  fitInterval,
  MAX_CANDLES,
  rangeDays,
  rangeWindow,
  recommendedInterval,
} from "./timeframe.js";

const MODE_STORAGE_KEY = "priceChartMode";
// período e tamanho de vela escolhidos ficam salvos; sem nada salvo, começa em D + 1 ano
const RANGE_STORAGE_KEY = "priceChartRange";
const INTERVAL_STORAGE_KEY = "priceChartInterval";
const DEFAULT_RANGE = "1y";
const DEFAULT_INTERVAL = "1d";
const VALID_INTERVALS = ["1h", "4h", "1d", "1w", "1M"];
const VALID_RANGE = /^(7d|30d|90d|6m|1y|2y|all|\d{1,4}[dmy])$/;
const PROJECTED_STORAGE_KEY = "priceChartProjectedAvg";
const STATS_STORAGE_KEY = "priceChartStats";
const ASSET_STORAGE_KEY = "priceChartAsset"; // última moeda vista
const DEFAULT_ASSET = "BTC"; // sem última moeda vista
const PANEL_TAB = "price-chart";
const STATS_DAYS_STORAGE_KEY = "priceChartStatsDays";
const DCA_STORAGE_KEY = "priceChartDca";

let chart = null; // controlador do Lightweight Charts (criado uma vez no init)
let picker = null; // seletor de moeda do título
const view = {
  asset: null,
  range: readStoredRange(),
  interval: readStoredInterval(),
  requestId: 0,
  points: null,
  loadingOlder: false,
  reachedStart: false, // já chegou na primeira vela da moeda
  mode: readStoredMode(),
  openOrders: null, // { buys, sells } da moeda aberta; null enquanto carrega
  showProjected: readStored(PROJECTED_STORAGE_KEY) === "1",
  // faixa estatística: ligada?, horizonte em dias e volatilidade da moeda aberta
  showStats: readStored(STATS_STORAGE_KEY) === "1",
  statsDays: clampStatsDays(Number(readStored(STATS_DAYS_STORAGE_KEY)) || 30),
  vol: null, // { sigmaDaily, days, price } | null (sem dados) | undefined (carregando)
  // comparação com compra mensal fixa: ligada? e resultado da moeda aberta
  showDca: readStored(DCA_STORAGE_KEY) === "1",
  dca: null, // resultado de dcaComparison | { empty } | null (não calculado/erro) | undefined (carregando)
};

function clampStatsDays(n) {
  return Math.min(365, Math.max(1, Math.round(n)));
}

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function readStoredMode() {
  return readStored(MODE_STORAGE_KEY) === "candle" ? "candle" : "line";
}

function readStoredRange() {
  const v = readStored(RANGE_STORAGE_KEY);
  return v && VALID_RANGE.test(v) ? v : DEFAULT_RANGE;
}

function readStoredInterval() {
  const v = readStored(INTERVAL_STORAGE_KEY);
  return VALID_INTERVALS.includes(v) ? v : DEFAULT_INTERVAL;
}

// salva período e vela juntos (os dois definem o que a aba mostra ao abrir de novo)
function saveTimeframe() {
  writeStored(RANGE_STORAGE_KEY, view.range);
  writeStored(INTERVAL_STORAGE_KEY, view.interval);
}

// ---------------------------------------------------------------------------
// preço médio projetado
// ---------------------------------------------------------------------------

function positionOf(asset) {
  const pos = state.positions?.[asset];
  return { avg: pos?.avgBuyPriceUSDT ?? null, qty: pos?.qty ?? null };
}

function projectedAvg() {
  if (!view.showProjected || !view.openOrders) return null;
  return avgAfterBuys(positionOf(view.asset), view.openOrders.buys);
}

// Checkbox do preço médio projetado: spinner enquanto carrega posição/ordens, desabilitado se não se aplica
function updateProjectedAvailability() {
  const input = document.getElementById("price-chart-projected");
  const label = document.getElementById("price-chart-projected-label");
  const text = document.getElementById("price-chart-projected-text");
  if (!input || !label) return;

  const loading = state.positionsLoading || !view.openOrders;
  const pos = positionOf(view.asset);
  const hasBuys = !!view.openOrders?.buys.length;
  const ok = !loading && !!(pos.avg && pos.qty) && hasBuys;

  input.checked = view.showProjected;
  input.disabled = !ok;
  label.classList.toggle("is-loading", loading);
  label.classList.toggle("disabled", !loading && !ok);
  label.title = ok || loading
    ? ""
    : !hasBuys
      ? "Nenhuma ordem de compra aberta para esta moeda"
      : "Disponível apenas para moedas com preço médio calculado";
  if (text) {
    text.textContent = !loading
      ? "Preço médio após compras abertas"
      : state.positionsLoading
        ? "Calculando preço médio..."
        : "Carregando ordens abertas...";
  }
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

// a aba do gráfico está na tela? (fora dela, o que mudar é redesenhado ao voltar)
function isOpen() {
  return isTabActive(PANEL_TAB);
}

// extra = { window } ao carregar dados novos, { prepended } ao receber histórico antigo
function render(extra = {}) {
  if (!chart || !view.points) return;
  chart.update({
    asset: view.asset,
    points: view.points,
    interval: view.interval,
    mode: view.mode,
    avg: positionOf(view.asset).avg,
    orders: ordersOnChart(view.points, view.asset),
    openOrders: view.openOrders,
    projectedAvg: projectedAvg(),
    statBand: statBand(),
    fixedAvg: view.showDca ? view.dca?.yourAvg ?? null : null,
    dcaAvg: view.showDca ? view.dca?.dcaAvg ?? null : null,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// faixa estatística (volatilidade histórica)
// ---------------------------------------------------------------------------

// linhas ±1σ no gráfico (só com a faixa ligada e a volatilidade calculada)
function statBand() {
  if (!view.showStats || !view.vol) return null;
  return { ...priceBand(view.vol.price, view.vol.sigmaDaily, view.statsDays, 1), days: view.statsDays };
}

// volatilidade vem das velas diárias do último ano, independente do tamanho de vela na tela
async function loadVolatility(asset) {
  view.vol = undefined;
  renderStats();
  try {
    const data = await getKlines(asset, "1d");
    if (view.asset !== asset) return;
    view.vol = dailyVolatility(data.points || []);
  } catch {
    if (view.asset !== asset) return;
    view.vol = null;
  }
  renderStats();
  render();
}

const pctText = (p) => (p === null ? "--" : p < 0.01 ? "< 1%" : p > 0.99 ? "> 99%" : `${Math.round(p * 100)}%`);

function renderStats() {
  const box = document.getElementById("price-chart-stats-box");
  if (!box) return;
  box.hidden = !view.showStats;
  if (!view.showStats) return;

  const disclaimer =
    '<p class="stats-disclaimer">⚠ Estatística baseada em quanto a moeda oscilou no último ano, supondo que continue igual e sem tendência. <b>Não é previsão</b>: notícias e mudanças de mercado ignoram isso.</p>';

  if (view.vol === undefined) {
    box.innerHTML = '<span class="mini-spinner"></span> Calculando volatilidade...';
    return;
  }
  if (!view.vol) {
    box.innerHTML = `Sem histórico diário suficiente (mínimo de 30 dias) para calcular a faixa.${disclaimer}`;
    return;
  }

  const { price, sigmaDaily } = view.vol;
  const n = view.statsDays;
  const typical = priceBand(price, sigmaDaily, n, 1);
  const wide = priceBand(price, sigmaDaily, n, 1.96);
  const pct = (v) => `${v >= price ? "+" : ""}${(((v - price) / price) * 100).toFixed(1).replace(".", ",")}%`;

  const lines = [
    `Volatilidade histórica (${view.vol.days} dias): <b>${annualizedPct(sigmaDaily).toFixed(0)}% ao ano</b> · ${(sigmaDaily * 100).toFixed(1).replace(".", ",")}% ao dia`,
    `Em <b>${n} dia${n > 1 ? "s" : ""}</b>, faixa típica (~68% das vezes): <b>${formatPrice(typical.low)} a ${formatPrice(typical.high)}</b> <span class="muted">(${pct(typical.low)} / ${pct(typical.high)})</span>`,
    `Faixa ampla (~95% das vezes): ${formatPrice(wide.low)} a ${formatPrice(wide.high)} <span class="muted">(${pct(wide.low)} / ${pct(wide.high)})</span>`,
  ];

  // chance de o preço tocar o preço médio (e o projetado, se ligado) dentro do horizonte
  const avg = positionOf(view.asset).avg;
  const proj = projectedAvg();
  const touch = (label, target) =>
    `Chance aproximada de tocar ${label} (${formatPrice(target)}) em ${n} dias: <b>${pctText(touchProbability(price, target, sigmaDaily, n))}</b>`;
  if (avg) lines.push(touch("seu preço médio", avg));
  if (proj) lines.push(touch("o médio após compras abertas", proj));

  box.innerHTML = lines.map((l) => `<div>${l}</div>`).join("") + disclaimer;
}

// ---------------------------------------------------------------------------
// comparação com compra mensal fixa (DCA)
// ---------------------------------------------------------------------------

// suas compras da moeda + velas diárias que cobrem desde a primeira compra
async function loadDca(asset) {
  view.dca = undefined;
  renderDca();
  try {
    const buys = buysOf(await loadMyOrders(), asset);
    let daily = [];
    if (buys.length) {
      const start = Math.min(...buys.map((o) => o.time));
      let before = null;
      while (true) {
        const data = await getKlines(asset, "1d", before);
        if (view.asset !== asset) return;
        const page = (data.points || []).filter((p) => !daily.length || p.time < daily[0].time);
        daily = [...page, ...daily];
        if (page.length < KLINES_PAGE || !daily.length || daily[0].time <= start) break;
        before = daily[0].time;
      }
    }
    if (view.asset !== asset) return;
    view.dca = dcaComparison(buys, daily) || { empty: buys.length ? "history" : "buys" };
  } catch {
    if (view.asset !== asset) return;
    view.dca = null;
  }
  renderDca();
  render();
}

function renderDca() {
  const box = document.getElementById("price-chart-dca-box");
  if (!box) return;
  box.hidden = !view.showDca;
  if (!view.showDca) return;

  const d = view.dca;
  const date = (ms) => new Date(ms).toLocaleDateString("pt-BR");
  // quantidade comparável: 4 dígitos significativos abaixo de 1, 2 casas acima
  const qty = (v) => v.toLocaleString("pt-BR", v >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 });
  const usdt = (v) => `${v.toFixed(2).formatCurrency()} USDT`;
  const note =
    '<p class="stats-disclaimer">Considera só as suas compras executadas (vendas ficam de fora), com parcelas mensais iguais entre a primeira e a última compra, pelo fechamento diário de cada data.</p>';

  if (d === undefined) {
    box.innerHTML = '<span class="mini-spinner"></span> Calculando compra mensal fixa...';
    return;
  }
  if (d === null) {
    box.innerHTML = "Não foi possível calcular a comparação com compra mensal fixa.";
    return;
  }
  if (d.empty === "buys") {
    box.innerHTML = "Nenhuma compra desta moeda no seu histórico para comparar.";
    return;
  }
  if (d.empty === "history") {
    box.innerHTML = "Sem histórico de preço diário cobrindo o período das suas compras.";
    return;
  }
  if (d.tooShort) {
    box.innerHTML = `Suas compras estão dentro de menos de 1 mês (${date(d.start)} a ${date(d.end)}): não dá para comparar com compras mensais.${note}`;
    return;
  }

  const better = d.diffPct < 0;
  const pct = Math.abs(d.diffPct).toFixed(1).replace(".", ",");
  const verdict =
    Math.abs(d.diffPct) < 0.05
      ? "Empate: seu preço médio é praticamente igual ao da compra mensal fixa"
      : `<span class="${better ? "dca-better" : "dca-worse"}">Suas compras saíram ${pct}% ${better ? "mais baratas" : "mais caras"} que a compra mensal fixa</span>`;
  box.innerHTML = [
    `Mesmo total (<b>${usdt(d.invested)}</b>) em <b>${d.months} parcelas mensais</b> de ${usdt(d.monthly)}, de ${date(d.start)} a ${date(d.end)}:`,
    `Preço médio fixo (todas as suas compras): <b>${formatPrice(d.yourAvg)}</b> · Médio mensal fixo: <b>${formatPrice(d.dcaAvg)}</b>`,
    `${verdict} → você comprou <b>${qty(d.qty)} ${view.asset}</b> vs. ${qty(d.dcaQty)} ${view.asset} no automático`,
  ].map((l) => `<div>${l}</div>`).join("") + note;
}

// Arrastou até o começo dos dados: busca a página anterior de velas e coloca no início
async function loadOlder() {
  if (view.loadingOlder || view.reachedStart || !view.points?.length) return;
  view.loadingOlder = true;
  const { requestId, asset, interval } = view;
  const wrap = document.getElementById("price-chart-canvas-wrap");
  wrap?.classList.add("is-loading-older");
  try {
    const first = view.points[0].time;
    const data = await getKlines(asset, interval, first);
    if (requestId !== view.requestId) return; // trocou de moeda/período/vela no meio
    const older = (data.points || []).filter((p) => p.time < first);
    if (older.length < KLINES_PAGE) view.reachedStart = true;
    if (!older.length) return;
    view.points = [...older, ...view.points];
    render({ prepended: older.length });
  } catch {
    // falhou: tenta de novo no próximo arrasto
  } finally {
    if (requestId === view.requestId) {
      view.loadingOlder = false;
      wrap?.classList.remove("is-loading-older");
    }
  }
}

function setMode(mode) {
  view.mode = mode;
  writeStored(MODE_STORAGE_KEY, mode);
  highlightMode();
  render(); // mesmos dados nos dois modos: só redesenha
}

function selectInterval(interval) {
  if (interval === view.interval) return;
  view.interval = interval;
  saveTimeframe();
  loadChart({ keepWindow: true });
}

function selectRange(range) {
  view.range = range;
  view.interval = recommendedInterval(rangeDays(range));
  saveTimeframe();
  highlightRange();
  loadChart();
}

function highlightMode() {
  document.querySelectorAll("#price-chart-mode button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === view.mode);
  });
}

function highlightInterval() {
  document.querySelectorAll("#price-chart-interval button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.interval === view.interval);
  });
}

function highlightRange() {
  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === view.range);
  });
  const isCustom = !document.querySelector(`#price-chart-ranges button[data-range="${view.range}"]`);
  document.getElementById("price-chart-custom")?.classList.toggle("active", isCustom);
  // período customizado salvo (ex.: "3m"): mostra o valor no formulário
  const custom = isCustom && /^(\d+)([dmy])$/.exec(view.range);
  if (custom) {
    document.getElementById("price-chart-custom-value").value = custom[1];
    document.getElementById("price-chart-custom-unit").value = custom[2];
  }
}

// ---------------------------------------------------------------------------
// init / abrir / fechar
// ---------------------------------------------------------------------------

export function initPriceChartPanel() {
  // posições (preço médio) chegam depois dos saldos: se a aba estiver na tela, redesenha
  on(POSITIONS_UPDATED, () => {
    if (!isOpen()) return;
    updateSimAvailability();
    updateProjectedAvailability();
    if (!view.points || state.positionsLoading) return;
    render();
    renderInfo();
    renderStats(); // chance de tocar o preço médio depende do preço médio
  });

  initBuySimulator();

  // título "XRP / USDT ▾": troca de moeda direto na aba
  picker = initAssetPicker({ getCurrent: () => view.asset, onSelect: openPriceChart });

  const container = document.getElementById("priceChartContainer");
  const wrap = document.getElementById("price-chart-canvas-wrap");
  if (container && wrap && window.LightweightCharts) {
    chart = createPriceChart(
      { container, wrap, legend: document.getElementById("price-chart-legend") },
      { onNeedOlder: loadOlder }
    );
  }

  const projectedInput = document.getElementById("price-chart-projected");
  projectedInput?.addEventListener("change", () => {
    view.showProjected = projectedInput.checked;
    writeStored(PROJECTED_STORAGE_KEY, view.showProjected ? "1" : "0");
    render();
    renderStats();
  });

  const statsInput = document.getElementById("price-chart-stats");
  const statsDaysInput = document.getElementById("price-chart-stats-days");
  if (statsInput) statsInput.checked = view.showStats;
  if (statsDaysInput) statsDaysInput.value = view.statsDays;
  statsInput?.addEventListener("change", () => {
    view.showStats = statsInput.checked;
    writeStored(STATS_STORAGE_KEY, view.showStats ? "1" : "0");
    if (view.showStats && view.vol === null && view.asset) loadVolatility(view.asset);
    renderStats();
    render();
  });
  statsDaysInput?.addEventListener("change", () => {
    view.statsDays = clampStatsDays(Number(statsDaysInput.value) || 30);
    statsDaysInput.value = view.statsDays;
    writeStored(STATS_DAYS_STORAGE_KEY, String(view.statsDays));
    renderStats();
    render();
  });

  const dcaInput = document.getElementById("price-chart-dca");
  if (dcaInput) dcaInput.checked = view.showDca;
  dcaInput?.addEventListener("change", () => {
    view.showDca = dcaInput.checked;
    writeStored(DCA_STORAGE_KEY, view.showDca ? "1" : "0");
    if (view.showDca && view.dca === null && view.asset) loadDca(view.asset);
    renderDca();
    render();
  });

  document.querySelectorAll("#price-chart-ranges button[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => selectRange(btn.dataset.range));
  });

  document.querySelectorAll("#price-chart-interval button").forEach((btn) => {
    btn.addEventListener("click", () => selectInterval(btn.dataset.interval));
  });

  document.querySelectorAll("#price-chart-mode button").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  highlightMode();

  document.getElementById("price-chart-custom")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = parseInt(document.getElementById("price-chart-custom-value").value, 10);
    const unit = document.getElementById("price-chart-custom-unit").value;
    if (!Number.isInteger(n) || n < 1 || n > 9999) return;
    selectRange(`${n}${unit}`);
  });

  // Esc fecha a lista de moedas (se aberta)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker?.isOpen()) picker.close();
  });

  // Ao entrar na aba: sem moeda ainda → última vista (ou BTC); com moeda → atualiza o que mudou fora dela
  on(TAB_CHANGED, (tab) => {
    if (tab !== PANEL_TAB) {
      picker?.close();
      return;
    }
    if (!view.asset) {
      openPriceChart(readStored(ASSET_STORAGE_KEY) || DEFAULT_ASSET);
      return;
    }
    updateSimAvailability();
    updateProjectedAvailability();
    renderStats();
    if (view.points) {
      render();
      renderInfo();
    }
  });
}

// Abre o gráfico de `asset` na aba "Gráfico de preço" (vindo da tabela de saldos ou do seletor)
export function openPriceChart(asset) {
  view.asset = asset;
  writeStored(ASSET_STORAGE_KEY, asset);
  showTab(PANEL_TAB); // com view.asset já definido, a aba não abre a moeda padrão por cima
  view.points = null;
  view.openOrders = null;
  view.vol = null;
  if (view.showStats) loadVolatility(asset);
  else renderStats();
  view.dca = null;
  if (view.showDca) loadDca(asset);
  else renderDca();
  if (!view.interval) view.interval = recommendedInterval(rangeDays(view.range));

  document.getElementById("price-chart-title").innerText = `${asset} / USDT`;
  setSimContext({ asset, lastPrice: null });
  chart?.clear(); // não mostrar (esmaecido) o gráfico da moeda anterior
  const info = document.getElementById("price-chart-info");
  if (info) info.innerHTML = "";
  updateSimAvailability();
  updateProjectedAvailability();
  highlightRange();
  loadChart();

  // ordens chegam em paralelo ao gráfico; se vierem depois, redesenha com os pontos/linhas
  loadMyOrders().then(() => {
    if (view.asset === asset && view.points && isOpen()) render();
  });
  loadOpenOrders(asset).then((openOrders) => {
    if (view.asset !== asset) return;
    view.openOrders = openOrders;
    updateProjectedAvailability();
    renderStats(); // o médio projetado depende das ordens abertas
    if (view.points && isOpen()) render();
  });
}

function renderInfo() {
  const info = document.getElementById("price-chart-info");
  if (!info || !view.points?.length) return;

  const lastPrice = view.points.at(-1).close;
  const avg = state.positions?.[view.asset]?.avgBuyPriceUSDT ?? null;
  const parts = [`Preço atual: <b>${formatPrice(lastPrice)} USDT</b>`];
  if (avg !== null) {
    const diff = ((lastPrice - avg) / avg) * 100;
    const cls = diff >= 0 ? "pnl-pos" : "pnl-neg";
    parts.push(`Preço médio: <b>${formatPrice(avg)} USDT</b>`);
    parts.push(`<span class="${cls}">${diff >= 0 ? "+" : ""}${diff.toFixed(2).formatCurrency()}% vs. preço médio</span>`);
  } else if (!Object.keys(state.positions || {}).length) {
    parts.push("Preço médio ainda sendo calculado...");
  }
  info.innerHTML = parts.join(" · ");
}

// ---------------------------------------------------------------------------
// carregamento
// ---------------------------------------------------------------------------

/**
 * Carrega as velas de view.interval que cobrem a janela pedida e a enquadra.
 * keepWindow: true → mantém a janela visível agora (troca de tamanho de vela).
 */
async function loadChart({ keepWindow = false } = {}) {
  const requestId = ++view.requestId;
  view.loadingOlder = false;
  view.reachedStart = false;
  const wrap = document.getElementById("price-chart-canvas-wrap");
  const error = document.getElementById("price-chart-error");
  wrap?.classList.add("is-loading");
  wrap?.classList.remove("is-loading-older");
  if (error) error.hidden = true;

  let win = (keepWindow && chart?.getVisibleWindow()) || rangeWindow(view.range);
  if (keepWindow) {
    // usuário escolheu a vela: respeita e, se a janela for grande demais pra ela, encurta a janela
    win = clampWindow(win, view.interval);
  } else {
    // janela escolhida pelo período: se a vela atual for fina demais pra ela, sobe a vela
    const fitted = fitInterval(view.interval, win.fromMs);
    if (fitted !== view.interval) {
      view.interval = fitted;
      saveTimeframe();
    }
  }
  const interval = view.interval;
  highlightInterval();

  try {
    // página mais recente e, se a janela começar antes dela, as anteriores (até MAX_CANDLES)
    let points = [];
    let before = null;
    let reachedStart = false;
    while (true) {
      const data = await getKlines(view.asset, interval, before);
      if (requestId !== view.requestId) return; // usuário trocou de moeda/período/vela no meio
      const page = (data.points || []).filter((p) => !points.length || p.time < points[0].time);
      points = [...page, ...points];
      if (page.length < KLINES_PAGE) {
        reachedStart = true; // veio menos que uma página: é o começo do histórico da moeda
        break;
      }
      if (points[0].time <= win.fromMs || points.length >= MAX_CANDLES) break;
      before = points[0].time;
    }

    view.points = points;
    view.reachedStart = reachedStart;
    setSimContext({ asset: view.asset, lastPrice: points.at(-1)?.close ?? null });
    updateSimAvailability();
    render({ window: win.fromMs <= 0 ? null : win });
    renderInfo();
  } catch (e) {
    if (requestId !== view.requestId) return;
    view.points = null;
    chart?.clear();
    if (error) {
      error.hidden = false;
      error.textContent = `Não foi possível carregar o gráfico: ${e.message}`;
    }
  } finally {
    if (requestId === view.requestId) wrap?.classList.remove("is-loading");
  }
}

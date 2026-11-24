// Aba "Gráfico de preço": moeda, tamanho da vela, período, modo Linha/Velas, opções e carregamento.
//
// Como no TradingView, são dois controles (regras em timeframe.js):
//   - tamanho da vela (1h · 4h · D · S · M): redesenha mantendo a janela de tempo que está na tela;
//   - período (7d, 30d, ..., Tudo, customizado): mostra essa janela e escolhe a vela recomendada.
import { state } from "../../core/state.js";
import { formatPrice } from "../../core/format.js";
import { BALANCES_UPDATED, COINALYZE_KEY_CHANGED, on, POSITIONS_UPDATED, TAB_CHANGED } from "../../core/events.js";
import { isTabActive, showTab } from "../tabs/Tabs.js";
import { getKlines, KLINES_PAGE, loadMyOrders, loadOpenOrders, ordersOnChart, invalidateAssetCache } from "./chartData.js";
import { createPriceChart } from "./chart/createChart.js";
import { avgAfterBuys, avgAfterSells, initBuySimulator, setSimContext, updateSimAvailability } from "./buySimulator.js";
import { initAssetPicker } from "./assetPicker.js";
import { initWatchlist } from "./watchlist.js";
import { buysOf, dcaComparison } from "./dca.js";
import { initOpenOrdersTable, renderOpenOrdersTable } from "./openOrdersTable.js";
import { getIndicators, getVolumeAverages, initIndicatorControls } from "./indicatorControls.js";
import { getCvdSettings, legacyCvdOn, mountPaneSettings } from "./paneSettings.js";
import { fetchFuturesData, fetchLiquidationMap, fetchLiquidations } from "../../api/binance.js";
import { openSettings } from "../settings/SettingsModal.js";
import { formatUsdShort } from "../../core/format.js";
import { FUTURES_HELP, FUTURES_PANES, PANE_LOADING } from "./chart/futuresPanes.js";
import { initOrderHistory, setHistoryAsset, showHistory, reloadHistory } from "./orderHistoryTable.js";
import { initTradeHistory, setTradesAsset, showTrades, reloadTrades } from "./tradeHistoryTable.js";
import { annualizedPct, dailyVolatility, priceBand, touchProbability } from "./volatility.js";
import {
  clampWindow,
  fitInterval,
  INTERVAL_MS,
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
const AVG_STORAGE_KEY = "priceChartDynamicAvg"; // linhas do médio dinâmico de compra e venda (ligado por padrão)
const OPEN_ORDERS_STORAGE_KEY = "priceChartOpenOrders"; // linhas das compras/vendas abertas (ligado por padrão)
const MY_ORDERS_STORAGE_KEY = "priceChartMyOrders"; // bolinhas das compras/vendas realizadas (ligado por padrão)
const PROJECTED_STORAGE_KEY = "priceChartProjectedAvg"; // médios após compras e vendas abertas (um checkbox só)
const STATS_STORAGE_KEY = "priceChartStats";
const ASSET_STORAGE_KEY = "priceChartAsset"; // última moeda vista
const DEFAULT_ASSET = "BTC"; // sem última moeda vista (se estiver na carteira; senão a de maior valor)
const PANEL_TAB = "price-chart";
const STATS_DAYS_STORAGE_KEY = "priceChartStatsDays";
const DCA_STORAGE_KEY = "priceChartDca";
const LIQ_STORAGE_KEY = "priceChartLiquidation";
const LIQ_CACHE_MS = 2 * 60 * 1000; // mapa de liquidação no cliente
const FUT_CACHE_MS = 2 * 60 * 1000; // dados de futuros no cliente
const FUT_LEGACY_STORAGE_KEY = "priceChartFutures"; // antes um checkbox só ligava os 3 painéis
// painéis de futuros, cada um com seu checkbox: chave do storage, texto e id do checkbox
const FUT_PANES = {
  oi: { storage: "priceChartFuturesOi", label: "Open interest (futuros)", input: "price-chart-fut-oi" },
  ls: { storage: "priceChartFuturesLs", label: "Long/short ratio (futuros)", input: "price-chart-fut-ls" },
  funding: { storage: "priceChartFuturesFunding", label: "Taxa de funding (futuros)", input: "price-chart-fut-funding" },
};
// período dos dados de futuros por tamanho de vela (a Binance tem 1h/4h/1d; S e M usam o diário)
const FUT_PERIOD = { "1h": "1h", "4h": "4h" };
const LIQREAL_STORAGE_KEY = "priceChartRealLiquidations"; // painel de liquidações reais (Coinalyze)
const LIQREAL_CACHE_MS = 5 * 60 * 1000;
const VOLUME_PANE_STORAGE_KEY = "priceChartVolumePane"; // painel de volume (ligado por padrão)
const CVD_PANE_STORAGE_KEY = "priceChartCvdPane"; // painel de CVD/Delta
const ORDERS_TAB_STORAGE_KEY = "priceChartOrdersTab"; // aba abaixo do gráfico: open | history | trades

let chart = null; // controlador do Lightweight Charts (criado uma vez no init)
let picker = null; // seletor de moeda do título
let watchlist = null; // lista de moedas ao lado do gráfico
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
  myOrdersLoading: false, // ordens executadas (bolinhas) carregando
  showAvg: readStored(AVG_STORAGE_KEY) !== "0", // liga as duas linhas do médio dinâmico (compra e venda)
  showOpenOrders: readStored(OPEN_ORDERS_STORAGE_KEY) !== "0", // compras e vendas abertas no gráfico
  showMyOrders: readStored(MY_ORDERS_STORAGE_KEY) !== "0", // compras e vendas realizadas no gráfico
  showProjected: readStored(PROJECTED_STORAGE_KEY) === "1", // liga as duas linhas (compras e vendas abertas)
  // faixa estatística: ligada?, horizonte em dias e volatilidade da moeda aberta
  showStats: readStored(STATS_STORAGE_KEY) === "1",
  statsDays: clampStatsDays(Number(readStored(STATS_DAYS_STORAGE_KEY)) || 30),
  vol: null, // { sigmaDaily, days, price } | null (sem dados) | undefined (carregando)
  // comparação com compra mensal fixa: ligada? e resultado da moeda aberta
  showDca: readStored(DCA_STORAGE_KEY) === "1",
  dca: null, // resultado de dcaComparison | { empty } | null (não calculado/erro) | undefined (carregando)
  // mapa de liquidação estimado: ligado? e dados da moeda aberta
  showLiq: readStored(LIQ_STORAGE_KEY) === "1",
  liq: null, // resposta de /liquidation-map | null (não carregado/erro) | undefined (carregando)
  // painéis de futuros: ligados? e dados (por moeda + período)
  // painéis de futuros ligados (sem escolha salva, herda o antigo checkbox "Dados de futuros")
  showFut: Object.fromEntries(
    FUTURES_PANES.map((k) => [k, (readStored(FUT_PANES[k].storage) ?? readStored(FUT_LEGACY_STORAGE_KEY)) === "1"])
  ),
  fut: null, // { key, data } | { key, data: null (erro) } | { key, loading: true }
  // painel de liquidações reais: ligado? e dados (por moeda + tamanho de vela)
  showLiqReal: readStored(LIQREAL_STORAGE_KEY) === "1",
  // painéis de volume e de CVD/Delta (sem escolha salva, o CVD herda o indicador da versão anterior)
  showVolume: readStored(VOLUME_PANE_STORAGE_KEY) !== "0",
  showCvd: (readStored(CVD_PANE_STORAGE_KEY) ?? (legacyCvdOn() ? "1" : "0")) === "1",
  liqReal: null, // { key, data } | { key, data: null (erro) } | { key, loading: true }
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

function projectedSellAvg() {
  if (!view.showProjected || !view.openOrders) return null;
  const pos = state.positions?.[view.asset];
  return avgAfterSells({ avgSell: pos?.avgSellPriceUSDT ?? null, soldQty: pos?.soldQtyCycle ?? 0 }, view.openOrders.sells);
}

// Checkbox do preço médio dinâmico: spinner enquanto as posições (preço médio) carregam
function updateAvgAvailability() {
  const input = document.getElementById("price-chart-avg");
  const label = document.getElementById("price-chart-avg-label");
  const text = document.getElementById("price-chart-avg-text");
  if (!input || !label) return;
  const loading = !!state.positionsLoading;
  input.checked = view.showAvg;
  input.disabled = loading;
  label.classList.toggle("is-loading", loading);
  if (text) text.textContent = loading ? "Calculando preço médio..." : "Preço médio dinâmico";
}

// Checkboxes "Ordens abertas" e "Ordens realizadas": spinner enquanto as ordens carregam
function updateOrdersAvailability() {
  const chips = [
    ["price-chart-open-orders", "showOpenOrders", !view.openOrders, "Ordens abertas", "Carregando ordens abertas..."],
    ["price-chart-my-orders", "showMyOrders", view.myOrdersLoading, "Ordens realizadas", "Carregando ordens realizadas..."],
  ];
  for (const [id, flag, loading, idle, busy] of chips) {
    const input = document.getElementById(id);
    const label = document.getElementById(`${id}-label`);
    const text = document.getElementById(`${id}-text`);
    if (!input || !label) continue;
    input.checked = view[flag];
    input.disabled = loading;
    label.classList.toggle("is-loading", loading);
    if (text) text.textContent = loading ? busy : idle;
  }
}

// Ordens executadas da moeda (bolinhas no gráfico): spinner no checkbox enquanto carregam; redesenha ao chegar
function reloadMyOrders(asset) {
  view.myOrdersLoading = true;
  updateOrdersAvailability();
  return loadMyOrders().then(() => {
    view.myOrdersLoading = false;
    updateOrdersAvailability();
    if (view.asset === asset && view.points && isOpen()) render();
  });
}

// Checkbox dos médios projetados (compras e vendas abertas): spinner enquanto carrega posição/ordens,
// desabilitado se nenhuma das duas linhas se aplica. Cada linha aparece no gráfico só quando se aplica.
function updateProjectedAvailability() {
  updateAvgAvailability();
  updateOrdersAvailability();
  const input = document.getElementById("price-chart-projected");
  const label = document.getElementById("price-chart-projected-label");
  const text = document.getElementById("price-chart-projected-text");
  if (!input || !label) return;

  const loading = state.positionsLoading || !view.openOrders;
  const pos = positionOf(view.asset);
  const hasBuys = !!view.openOrders?.buys.length;
  const hasSells = !!view.openOrders?.sells.length;
  const buyOk = !!(pos.avg && pos.qty) && hasBuys;
  const ok = !loading && (buyOk || hasSells);

  input.checked = view.showProjected;
  input.disabled = !ok;
  label.classList.toggle("is-loading", loading);
  label.classList.toggle("disabled", !loading && !ok);
  label.title = ok || loading
    ? "Linhas do seu preço médio de compra após as compras abertas e do preço médio de venda após as vendas abertas, se forem executadas"
    : !hasBuys
      ? "Nenhuma ordem aberta para esta moeda"
      : "Compras abertas exigem preço médio calculado, e não há vendas abertas para esta moeda";
  if (text) {
    text.textContent = !loading
      ? "Preço médio após ordens abertas"
      : state.positionsLoading
        ? "Calculando preço médio..."
        : "Carregando ordens abertas...";
  }
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

// resumo no canto do gráfico: "BTC/USDT · 4h · 30 dias"
const INTERVAL_LABELS = { "1h": "1h", "4h": "4h", "1d": "Diário", "1w": "Semanal", "1M": "Mensal" };
const RANGE_LABELS = { "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", "6m": "6 meses", "1y": "1 ano", "2y": "2 anos", all: "Tudo" };

// período personalizado ("3m") → "3 meses"; null se não for personalizado
function customRangeLabel(range) {
  const custom = /^(\d+)([dmy])$/.exec(range);
  if (!custom) return null;
  const n = Number(custom[1]);
  const unit = { d: ["dia", "dias"], m: ["mês", "meses"], y: ["ano", "anos"] }[custom[2]];
  return `${n} ${unit[n === 1 ? 0 : 1]}`;
}

function chartSummary() {
  if (!view.asset) return "";
  const range = RANGE_LABELS[view.range] || customRangeLabel(view.range);
  return [`${view.asset}/USDT`, INTERVAL_LABELS[view.interval] || view.interval, range].filter(Boolean).join(" · ");
}

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
    avg: view.showAvg ? positionOf(view.asset).avg : null,
    avgSell: view.showAvg ? state.positions?.[view.asset]?.avgSellPriceUSDT ?? null : null,
    orders: view.showMyOrders ? ordersOnChart(view.points, view.asset) : { buys: [], sells: [] },
    openOrders: view.showOpenOrders ? view.openOrders : null,
    projectedAvg: projectedAvg(),
    projectedSellAvg: projectedSellAvg(),
    statBand: statBand(),
    fixedAvg: view.showDca ? view.dca?.yourAvg ?? null : null,
    dcaAvg: view.showDca ? view.dca?.dcaAvg ?? null : null,
    indicators: getIndicators(),
    volume: view.showVolume,
    volumeAverages: getVolumeAverages(),
    cvd: view.showCvd ? getCvdSettings() : null,
    summary: chartSummary(),
    liquidation: view.showLiq && view.liq?.available ? view.liq : null,
    futures: futuresForChart(),
    futuresPanes: futPanesOn(),
    liquidations: liquidationsForChart(),
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
  // faixa é aproximada: 5 dígitos significativos bastam (54.546 em vez de 54.545,8121)
  const band = (v) => formatPrice(Number(v.toPrecision(5)));

  const lines = [
    `Volatilidade histórica (${view.vol.days} dias): <b>${annualizedPct(sigmaDaily).toFixed(0)}% ao ano</b> · ${(sigmaDaily * 100).toFixed(1).replace(".", ",")}% ao dia`,
    `Em <b>${n} dia${n > 1 ? "s" : ""}</b>, faixa típica (~68% das vezes): <b>${band(typical.low)} a ${band(typical.high)}</b> <span class="muted">(${pct(typical.low)} / ${pct(typical.high)})</span>`,
    `Faixa ampla (~95% das vezes): ${band(wide.low)} a ${band(wide.high)} <span class="muted">(${pct(wide.low)} / ${pct(wide.high)})</span>`,
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

// ---------------------------------------------------------------------------
// painéis de futuros: open interest, long/short e funding (abaixo do gráfico)
// ---------------------------------------------------------------------------

const futCache = new Map(); // "ASSET|período" -> { at, data }
const futKey = () => `${view.asset}|${FUT_PERIOD[view.interval] || "1d"}`;

// dados prontos para o gráfico, PANE_LOADING (painéis ficam com spinner) ou null; se faltam para a
// moeda/período atual, começa a carregar
// painéis de futuros ligados, na ordem do gráfico
const futPanesOn = () => FUTURES_PANES.filter((k) => view.showFut[k]);

function futuresForChart() {
  if (!futPanesOn().length || !view.asset) return null;
  if (view.fut?.key !== futKey()) loadFutures();
  if (view.fut?.loading) return PANE_LOADING;
  return view.fut?.data?.available ? view.fut.data : null;
}

async function loadFutures() {
  const key = futKey();
  const [asset, period] = key.split("|");
  const hit = futCache.get(key);
  if (hit && Date.now() - hit.at < FUT_CACHE_MS) {
    view.fut = { key, data: hit.data };
    updateFuturesAvailability();
    return;
  }
  view.fut = { key, loading: true };
  updateFuturesAvailability();
  let data = null;
  try {
    data = await fetchFuturesData(asset, period);
    futCache.set(key, { at: Date.now(), data });
  } catch {}
  if (futKey() !== key) return; // trocou de moeda/vela no meio
  view.fut = { key, data };
  updateFuturesAvailability();
  render();
}

// checkboxes dos painéis de futuros (os ligados): spinner enquanto carrega; aviso quando a moeda não tem
// contrato perpétuo
function updateFuturesAvailability() {
  for (const key of FUTURES_PANES) {
    const { input, label: name } = FUT_PANES[key];
    const label = document.getElementById(`${input}-label`);
    const text = document.getElementById(`${input}-text`);
    if (!label || !text) continue;
    const on = view.showFut[key];
    const loading = on && !!view.fut?.loading;
    const unavailable = on && view.fut && !view.fut.loading && !view.fut.data?.available;
    label.classList.toggle("is-loading", loading);
    label.classList.toggle("disabled", unavailable);
    text.textContent = loading
      ? "Carregando dados de futuros..."
      : unavailable
        ? view.fut.data?.reason === "no-perpetual"
          ? `${name}: ${view.asset} sem contrato perpétuo`
          : `${name}: indisponível`
        : name;
  }
}

// ---------------------------------------------------------------------------
// liquidações reais (Binance + Bybit + OKX via Coinalyze; painel abaixo do gráfico)
// ---------------------------------------------------------------------------

const liqRealCache = new Map(); // "ASSET|vela" -> { at, data }
const liqRealKey = () => `${view.asset}|${view.interval}`;

// dados prontos para o gráfico, PANE_LOADING (painel fica com spinner) ou null; se faltam para a
// moeda/vela atual, começa a carregar
function liquidationsForChart() {
  if (!view.showLiqReal || !view.asset) return null;
  if (view.liqReal?.key !== liqRealKey()) loadLiquidations();
  if (view.liqReal?.loading) return PANE_LOADING;
  return view.liqReal?.data?.available ? view.liqReal.data : null;
}

async function loadLiquidations() {
  const key = liqRealKey();
  const [asset, interval] = key.split("|");
  const hit = liqRealCache.get(key);
  if (hit && Date.now() - hit.at < LIQREAL_CACHE_MS) {
    view.liqReal = { key, data: hit.data };
    updateLiquidationsAvailability();
    return;
  }
  view.liqReal = { key, loading: true };
  updateLiquidationsAvailability();
  let data = null;
  try {
    data = await fetchLiquidations(asset, interval);
    // só guarda o que deu certo (sem chave ou com erro, tenta de novo na próxima vez)
    if (data.available || data.reason === "no-market") liqRealCache.set(key, { at: Date.now(), data });
  } catch {}
  if (liqRealKey() !== key) return; // trocou de moeda/vela no meio
  view.liqReal = { key, data };
  updateLiquidationsAvailability();
  render();
}

// chave da Coinalyze salva ou removida nas Configurações: recarrega o painel
function reloadLiquidations() {
  liqRealCache.clear();
  view.liqReal = null;
  updateLiquidationsAvailability();
  render();
}

const needsCoinalyzeKey = () => ["no-key", "invalid-key"].includes(view.liqReal?.data?.reason);

// checkbox: spinner enquanto carrega; avisos sem chave, sem contrato ou com erro
function updateLiquidationsAvailability() {
  const label = document.getElementById("price-chart-liqreal-label");
  const text = document.getElementById("price-chart-liqreal-text");
  if (!label || !text) return;
  const r = view.liqReal;
  const loading = view.showLiqReal && !!r?.loading;
  const unavailable = view.showLiqReal && r && !r.loading && !r.data?.available;
  label.classList.toggle("is-loading", loading);
  label.classList.toggle("disabled", unavailable);
  const reason = r?.data?.reason;
  text.textContent = loading
    ? "Carregando liquidações..."
    : !unavailable
      ? "Liquidações"
      : reason === "no-key"
        ? "Liquidações: configure a chave da Coinalyze"
        : reason === "invalid-key"
          ? "Liquidações: chave da Coinalyze recusada"
          : reason === "no-market"
            ? `Liquidações: ${view.asset} sem contrato perpétuo`
            : "Liquidações indisponíveis";
  label.title = unavailable && r.data?.message ? r.data.message : LIQREAL_TITLE;
}
const LIQREAL_TITLE =
  "Painel com as liquidações que de fato aconteceram nos futuros perpétuos (Binance + Bybit + OKX, dados da Coinalyze), abaixo do gráfico";

// ---------------------------------------------------------------------------
// mapa de liquidação estimado (futuros: open interest + long/short)
// ---------------------------------------------------------------------------

const liqCache = new Map(); // asset -> { at, data }

async function loadLiquidation(asset) {
  const hit = liqCache.get(asset);
  if (hit && Date.now() - hit.at < LIQ_CACHE_MS) {
    view.liq = hit.data;
  } else {
    view.liq = undefined;
    renderLiq();
    try {
      const data = await fetchLiquidationMap(asset);
      liqCache.set(asset, { at: Date.now(), data });
      if (view.asset !== asset) return;
      view.liq = data;
    } catch {
      if (view.asset !== asset) return;
      view.liq = null;
    }
  }
  renderLiq();
  render();
}

function renderLiq() {
  const box = document.getElementById("price-chart-liq-box");
  if (!box) return;
  box.hidden = !view.showLiq;
  if (!view.showLiq) return;

  const d = view.liq;
  const disclaimer =
    `<p class="stats-disclaimer">⚠ <b>Estimativa, não dado real.</b> Ninguém publica onde estão as posições alavancadas: o modelo deduz isso pela variação do <span class="help-tip" data-tip="${FUTURES_HELP.oi}">open interest</span> hora a hora, pela razão long/short e supondo alavancagens de 5x a 100x. Use como região provável, não como nível exato.</p>`;
  if (d === undefined) {
    box.innerHTML = '<span class="mini-spinner"></span> Calculando mapa de liquidação (30 dias de futuros)...';
    return;
  }
  if (d === null) {
    box.innerHTML = "Não foi possível carregar o mapa de liquidação (API de futuros da Binance).";
    return;
  }
  if (!d.available) {
    box.innerHTML =
      d.reason === "no-perpetual"
        ? `Mapa indisponível: ${view.asset} não tem contrato perpétuo em USDT na Binance Futures.`
        : "Mapa indisponível: sem histórico de open interest para este contrato.";
    return;
  }

  const pct = (p) => `${p >= d.price ? "+" : ""}${(((p - d.price) / d.price) * 100).toFixed(1).replace(".", ",")}%`;
  // níveis são faixas de 0,25%: 5 dígitos significativos bastam (65.828 em vez de 65.827,6745)
  const lvlPrice = (p) => formatPrice(Number(p.toPrecision(5)));
  const near = (l) => Math.abs(l.price / d.price - 1) <= 0.1;
  const above = d.levels.filter((l) => l.price > d.price && near(l));
  const below = d.levels.filter((l) => l.price < d.price && near(l));
  const sum = (list, k) => list.reduce((a, l) => a + l[k], 0);
  const top = (list, k) => [...list].sort((a, b) => b[k] - a[k])[0];
  const topShort = top(above, "short");
  const topLong = top(below, "long");
  const shortsAbove = sum(above, "short");
  const longsBelow = sum(below, "long");
  const pctTxt = (v) => (v === null || v === undefined ? "--" : `${Math.round(v * 100)}%`);

  const lines = [
    `Contrato <b>${d.symbol}</b>${d.multiplier > 1 ? ` (preços convertidos para 1 ${view.asset})` : ""} · últimos 30 dias · cada faixa é um nível de liquidação estimado (de roxo apagado a amarelo forte = mais dinheiro) e some quando o preço passa por ele. Barras à direita: o que ainda está pendente.`,
  ];
  if (topShort) lines.push(`Maior concentração acima (vendidos/shorts): <b>${lvlPrice(topShort.price)}</b> <span class="muted">(${pct(topShort.price)})</span> · ≈ ${formatUsdShort(topShort.short)} USDT`);
  if (topLong) lines.push(`Maior concentração abaixo (comprados/longs): <b>${lvlPrice(topLong.price)}</b> <span class="muted">(${pct(topLong.price)})</span> · ≈ ${formatUsdShort(topLong.long)} USDT`);
  if (shortsAbove || longsBelow) {
    const side = shortsAbove > longsBelow * 1.2 ? "acima" : longsBelow > shortsAbove * 1.2 ? "abaixo" : null;
    lines.push(
      `Até ±10% do preço: ≈ ${formatUsdShort(shortsAbove)} em shorts acima · ≈ ${formatUsdShort(longsBelow)} em longs abaixo${side ? ` → mais liquidez <b>${side}</b> (o preço costuma ser atraído para onde há mais liquidações)` : ""}`
    );
  }
  const tip = (text, help) => `<span class="help-tip" data-tip="${help}">${text}</span>`;
  lines.push(
    `${tip("Contas compradas", FUTURES_HELP.ls)}: ${pctTxt(d.ratios.globalLongAccount)} · ${tip("Top traders (posição) comprados", FUTURES_HELP.ls)}: ${pctTxt(d.ratios.topLongPosition)}`
  );
  box.innerHTML = lines.map((l) => `<div>${l}</div>`).join("") + disclaimer;
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

// ---------------------------------------------------------------------------
// médias móveis: velas de "aquecimento" antes da janela visível
// ---------------------------------------------------------------------------

// maior período entre as médias visíveis, do preço e do volume (0 = nenhuma)
function maxMaPeriod() {
  const volumeAvgs = view.showVolume ? getVolumeAverages() : [];
  return Math.max(0, ...[...getIndicators(), ...volumeAvgs].filter((m) => m.visible).map((m) => m.period));
}

// Média nova/maior: se não há velas suficientes antes do que está na tela, busca a página anterior
function ensureWarmup() {
  const period = maxMaPeriod();
  if (!period || view.reachedStart || !view.points?.length) return;
  const win = chart?.getVisibleWindow();
  if (!win) return;
  const before = view.points.filter((p) => p.time < win.fromMs).length;
  if (before < period) loadOlder();
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
  document.getElementById("price-chart-custom-btn")?.classList.toggle("active", isCustom);
  // período customizado salvo (ex.: "3m"): mostra o valor no formulário e no botão ("3 meses")
  const custom = isCustom && /^(\d+)([dmy])$/.exec(view.range);
  const label = document.getElementById("price-chart-custom-label");
  if (custom) {
    document.getElementById("price-chart-custom-value").value = custom[1];
    document.getElementById("price-chart-custom-unit").value = custom[2];
    if (label) label.textContent = customRangeLabel(view.range);
  } else if (label) {
    label.textContent = "Personalizado";
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
  initIndicatorControls(document.getElementById("price-chart-mas"), {
    onChange() {
      render();
      ensureWarmup();
    },
  });
  initOpenOrdersTable(document.getElementById("pco-open"), { onRetry: () => view.asset && reloadOpenOrders(view.asset) });
  initOrdersTabs();

  // título "XRP / USDT ▾": troca de moeda direto na aba
  picker = initAssetPicker({ getCurrent: () => view.asset, onSelect: openPriceChart });
  // lista de moedas à direita do gráfico (atualiza com os saldos)
  watchlist = initWatchlist({ getCurrent: () => view.asset, onSelect: openPriceChart });
  on(BALANCES_UPDATED, () => {
    watchlist.refresh();
    // aba aberta esperando os saldos para escolher a moeda inicial
    if (!view.asset && isTabActive(PANEL_TAB)) openInitialAsset(true);
  });

  const container = document.getElementById("priceChartContainer");
  const wrap = document.getElementById("price-chart-canvas-wrap");
  if (container && wrap && window.LightweightCharts) {
    chart = createPriceChart(
      { container, wrap, legend: document.getElementById("price-chart-legend") },
      {
        onNeedOlder: loadOlder,
        // engrenagem nos títulos dos painéis de volume e de CVD
        mountPaneSettings: (key, el) =>
          mountPaneSettings(key, el, () => {
            render();
            ensureWarmup();
          }),
      }
    );
  }

  // painéis de volume e de CVD/Delta (configurações pela engrenagem no título de cada um)
  for (const [id, flag, storage] of [
    ["price-chart-volume-pane", "showVolume", VOLUME_PANE_STORAGE_KEY],
    ["price-chart-cvd-pane", "showCvd", CVD_PANE_STORAGE_KEY],
  ]) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.checked = view[flag];
    if (readStored(storage) === null) writeStored(storage, view[flag] ? "1" : "0"); // fixa o padrão herdado
    input.addEventListener("change", () => {
      view[flag] = input.checked;
      writeStored(storage, input.checked ? "1" : "0");
      render();
      ensureWarmup();
    });
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

  // painéis de futuros: open interest, long/short e funding, cada um independente
  for (const key of FUTURES_PANES) {
    const futInput = document.getElementById(FUT_PANES[key].input);
    if (!futInput) continue;
    futInput.checked = view.showFut[key];
    futInput.addEventListener("change", () => {
      view.showFut[key] = futInput.checked;
      writeStored(FUT_PANES[key].storage, futInput.checked ? "1" : "0");
      updateFuturesAvailability();
      render();
    });
  }

  // liquidações reais: sem chave da Coinalyze, ligar abre as Configurações
  on(COINALYZE_KEY_CHANGED, reloadLiquidations);
  const liqRealInput = document.getElementById("price-chart-liqreal");
  if (liqRealInput) liqRealInput.checked = view.showLiqReal;
  liqRealInput?.addEventListener("change", () => {
    view.showLiqReal = liqRealInput.checked;
    writeStored(LIQREAL_STORAGE_KEY, view.showLiqReal ? "1" : "0");
    if (view.showLiqReal && needsCoinalyzeKey()) {
      openSettings("coinalyze");
      view.liqReal = null; // tenta de novo (a chave pode ter sido salva enquanto isso)
    }
    updateLiquidationsAvailability();
    render();
  });

  const liqInput = document.getElementById("price-chart-liq");
  if (liqInput) liqInput.checked = view.showLiq;
  liqInput?.addEventListener("change", () => {
    view.showLiq = liqInput.checked;
    writeStored(LIQ_STORAGE_KEY, view.showLiq ? "1" : "0");
    if (view.showLiq && view.liq === null && view.asset) loadLiquidation(view.asset);
    renderLiq();
    render();
  });

  const avgInput = document.getElementById("price-chart-avg");
  if (avgInput) avgInput.checked = view.showAvg;
  avgInput?.addEventListener("change", () => {
    view.showAvg = avgInput.checked;
    writeStored(AVG_STORAGE_KEY, view.showAvg ? "1" : "0");
    render();
  });

  // ordens abertas / realizadas no gráfico (cada checkbox liga compras e vendas juntas)
  for (const [id, flag, key] of [
    ["price-chart-open-orders", "showOpenOrders", OPEN_ORDERS_STORAGE_KEY],
    ["price-chart-my-orders", "showMyOrders", MY_ORDERS_STORAGE_KEY],
  ]) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.checked = view[flag];
    input.addEventListener("change", () => {
      view[flag] = input.checked;
      writeStored(key, view[flag] ? "1" : "0");
      render();
    });
  }

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
    setCustomOpen(false);
    selectRange(`${n}${unit}`);
  });

  // "Personalizado": abre/fecha o formulário; clique fora ou Esc fecha
  const customBtn = document.getElementById("price-chart-custom-btn");
  const customForm = document.getElementById("price-chart-custom");
  function setCustomOpen(open) {
    if (!customForm || !customBtn) return;
    customForm.hidden = !open;
    customBtn.setAttribute("aria-expanded", String(open));
    if (open) document.getElementById("price-chart-custom-value")?.focus();
  }
  customBtn?.addEventListener("click", () => setCustomOpen(customForm.hidden));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#price-chart-custom-wrap")) setCustomOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setCustomOpen(false);
  });

  // botão de engrenagem: abre/fecha a lista de camadas (marcar uma camada não fecha a lista)
  const layersBtn = document.getElementById("price-chart-layers-btn");
  const layersPop = document.getElementById("price-chart-layers");
  function setLayersOpen(open) {
    if (!layersBtn || !layersPop) return;
    layersPop.hidden = !open;
    layersBtn.setAttribute("aria-expanded", String(open));
  }
  layersBtn?.addEventListener("click", () => setLayersOpen(layersPop.hidden));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#price-chart-layers-wrap")) setLayersOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setLayersOpen(false);
  });

  // "Ajustar zoom" (topo da aba): enquadra todo o período carregado
  document.getElementById("price-chart-fit")?.addEventListener("click", () => chart?.fit());

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
      openInitialAsset();
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
// Moeda sem última vista: BTC se estiver na carteira; senão a de maior valor em carteira.
// null = saldos ainda não chegaram (a escolha espera por eles).
function defaultAsset() {
  const assets = state.currentAssets.filter((a) => a.asset !== "USDT");
  if (!assets.length) return null;
  if (assets.some((a) => a.asset === DEFAULT_ASSET)) return DEFAULT_ASSET;
  return assets.reduce((top, a) => (a.totalUSDT > top.totalUSDT ? a : top)).asset;
}

// abre a última moeda vista ou a padrão; balancesLoaded: carteira já carregada (vazia → BTC)
function openInitialAsset(balancesLoaded = false) {
  const asset = readStored(ASSET_STORAGE_KEY) || defaultAsset() || (balancesLoaded ? DEFAULT_ASSET : null);
  if (asset) openPriceChart(asset);
}

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
  view.liq = null;
  if (view.showLiq) loadLiquidation(asset);
  else renderLiq();

  document.getElementById("price-chart-title").innerText = `${asset} / USDT`;
  watchlist?.refresh(); // destaca a moeda aberta
  setSimContext({ asset, lastPrice: null });
  chart?.clear(); // não mostrar (esmaecido) o gráfico da moeda anterior
  const info = document.getElementById("price-chart-info");
  if (info) info.innerHTML = "";
  updateSimAvailability();
  updateProjectedAvailability();
  renderOrdersTable();
  setHistoryAsset(asset, ordersTab === "history");
  setTradesAsset(asset, ordersTab === "trades");
  highlightRange();
  loadChart();

  // ordens chegam em paralelo ao gráfico; se vierem depois, redesenha com os pontos/linhas
  reloadMyOrders(asset);
  reloadOpenOrders(asset);
}

// Botão Atualizar do topo: busca de novo, da moeda aberta, as ordens abertas, as executadas (pontos no
// gráfico), as abas de histórico, as camadas ligadas e, com a aba visível, as velas (mantendo o trecho
// que está na tela).
export function refreshPriceChart() {
  const asset = view.asset;
  if (!asset) return Promise.resolve();
  invalidateAssetCache(asset);
  const tasks = [
    reloadOpenOrders(asset),
    reloadMyOrders(asset),
    reloadHistory(ordersTab === "history"),
    reloadTrades(ordersTab === "trades"),
    ...refreshLayers(asset),
  ];
  if (isOpen()) tasks.push(loadChart({ keepWindow: true }));
  return Promise.allSettled(tasks);
}

// Camadas do gráfico no Atualizar: descarta o cache do cliente da moeda; as ligadas carregam de novo,
// as desligadas ficam vazias e carregam frescas quando forem ligadas. (O server ainda pode responder
// do cache curto dele.)
function refreshLayers(asset) {
  const dropAsset = (cache) => {
    for (const key of cache.keys()) if (key.startsWith(`${asset}|`)) cache.delete(key);
  };
  liqCache.delete(asset);
  dropAsset(futCache);
  dropAsset(liqRealCache);

  const tasks = [];
  // faixa estatística (velas diárias) e compra mensal fixa (suas compras executadas + velas diárias)
  if (view.showStats) tasks.push(loadVolatility(asset));
  else view.vol = null;
  if (view.showDca) tasks.push(loadDca(asset));
  else view.dca = null;
  // mapa de liquidação estimado
  if (view.showLiq) tasks.push(loadLiquidation(asset));
  else view.liq = null;
  // painéis de futuros e de liquidações reais (as funções de carga usam a moeda/vela atuais)
  if (futPanesOn().length) tasks.push(loadFutures());
  else view.fut = null;
  if (view.showLiqReal) tasks.push(loadLiquidations());
  else view.liqReal = null;
  return tasks;
}

// carrega as ordens abertas da moeda (na troca de moeda, no "Tentar de novo" da tabela e no Atualizar do topo)
function reloadOpenOrders(asset) {
  if (view.openOrders?.all === null) {
    view.openOrders = null; // tentando de novo depois de um erro: volta a mostrar "carregando"
    renderOrdersTable();
  }
  return loadOpenOrders(asset).then((openOrders) => {
    if (view.asset !== asset) return;
    view.openOrders = openOrders;
    updateProjectedAvailability();
    renderOrdersTable();
    renderStats(); // o médio projetado depende das ordens abertas
    if (view.points && isOpen()) render();
  });
}

// tabela de ordens abertas abaixo do gráfico (undefined = carregando)
function renderOrdersTable() {
  const orders = view.openOrders ? view.openOrders.all : undefined;
  renderOpenOrdersTable(
    document.getElementById("pco-open"),
    orders,
    view.asset,
    document.getElementById("pco-open-count"),
    view.openOrders?.error,
    view.openOrders?.stale ? view.openOrders.staleAt : null
  );
}

// ---------------------------------------------------------------------------
// abas abaixo do gráfico: Ordens abertas | Histórico de ordens
// ---------------------------------------------------------------------------

let ordersTab = ["history", "trades"].includes(readStored(ORDERS_TAB_STORAGE_KEY)) ? readStored(ORDERS_TAB_STORAGE_KEY) : "open";

function showOrdersTab(tab) {
  ordersTab = tab;
  writeStored(ORDERS_TAB_STORAGE_KEY, tab);
  document.querySelectorAll("#price-chart-orders .pco-tab").forEach((b) => {
    const active = b.dataset.pcoTab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#price-chart-orders .pco-pane").forEach((p) => {
    p.hidden = p.dataset.pcoPane !== tab;
  });
  // carregam só quando a aba é aberta
  if (tab === "history") showHistory();
  if (tab === "trades") showTrades();
}

function initOrdersTabs() {
  initOrderHistory({
    list: document.getElementById("pco-history"),
    presets: document.querySelectorAll("[data-pco-pane=\"history\"] [data-period]"),
    from: document.getElementById("pco-from"),
    to: document.getElementById("pco-to"),
    search: document.getElementById("pco-search"),
    reset: document.getElementById("pco-reset"),
  });
  initTradeHistory({
    list: document.getElementById("pco-trades"),
    presets: document.querySelectorAll("[data-pco-pane=\"trades\"] [data-period]"),
    from: document.getElementById("pct-from"),
    to: document.getElementById("pct-to"),
    search: document.getElementById("pct-search"),
    reset: document.getElementById("pct-reset"),
  });
  document.querySelectorAll("#price-chart-orders .pco-tab").forEach((b) => {
    b.addEventListener("click", () => showOrdersTab(b.dataset.pcoTab));
  });
  showOrdersTab(ordersTab);
}

// Dicas dos rótulos do topo (hover)
const INFO_HELP = {
  avg: [
    "Quanto você pagou, em média, pelas moedas que tem hoje (o mesmo usado no P&L).",
    "• Cada compra entra na média pelo preço pago.",
    "• Cada venda tira moedas pelo preço médio, sem mudar a média.",
    "• Por isso compras feitas depois de vendas pesam mais. Se o saldo zera, a média recomeça.",
  ].join("\n"),
  avgSell: [
    "Quanto você recebeu, em média, por moeda nas vendas da posição que tem hoje.",
    "• Cada venda entra na média pelo preço recebido (já sem as taxas).",
    "• As compras não mudam a média.",
    "• Se o saldo zera, a média recomeça.",
  ].join("\n"),
  diff: [
    "1º valor: quanto o preço atual está acima ou abaixo do seu preço médio dinâmico de compra.",
    "• Positivo (verde): as moedas que você tem valem mais do que custaram.",
    "• Negativo (vermelho): valem menos.",
    "",
    "2º valor: quanto o preço precisa andar para voltar ao preço médio.",
    "• No prejuízo, a alta necessária para empatar (ex.: -20% exige +25%).",
    "• No lucro, a queda que zeraria o lucro (ex.: +25% some com -20%).",
  ].join("\n"),
};

function renderInfo() {
  const info = document.getElementById("price-chart-info");
  if (!info || !view.points?.length) return;

  const lastPrice = view.points.at(-1).close;
  const avg = state.positions?.[view.asset]?.avgBuyPriceUSDT ?? null;
  // valores de 1 ou mais com 2 casas (78.086,17); abaixo de 1, dígitos significativos
  const big = (v) => (v >= 1 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : formatPrice(v));
  const stat = (label, value) => `<div class="pc-stat"><span class="pc-label">${label}</span><span class="pc-stat-value">${value}</span></div>`;
  const tip = (label, help) => `<span class="help-tip" data-tip="${help}">${label}</span>`;
  const avgSell = state.positions?.[view.asset]?.avgSellPriceUSDT ?? null;
  const avgLabel = tip("Preço médio dinâmico de compra", INFO_HELP.avg);
  const blocks = [stat("Preço atual", `${big(lastPrice)} <small>USDT</small>`)];
  if (avg !== null) {
    const diff = ((lastPrice - avg) / avg) * 100;
    blocks.push(stat(avgLabel, `${big(avg)} <small>USDT</small>`));
    // quanto o preço precisa andar para voltar ao preço médio (no prejuízo: alta; no lucro: queda)
    const back = (avg / lastPrice - 1) * 100;
    const pct = (v) => `<span class="${v >= 0 ? "pnl-pos" : "pnl-neg"}">${v >= 0 ? "+" : ""}${v.toFixed(2).formatCurrency()}%</span>`;
    blocks.push(
      stat(
        tip("Vs. preço médio", INFO_HELP.diff),
        `<span class="pc-pill ${diff >= 0 ? "pos" : "neg"}">${pct(diff)}<span class="pc-pill-sep">/</span>${pct(back)}</span>`
      )
    );
  } else if (!Object.keys(state.positions || {}).length) {
    blocks.push(stat(avgLabel, `<span class="pc-stat-pending"><span class="mini-spinner"></span> calculando...</span>`));
  }
  if (avgSell !== null) {
    blocks.push(stat(tip("Preço médio dinâmico de venda", INFO_HELP.avgSell), `${big(avgSell)} <small>USDT</small>`));
  }
  info.innerHTML = blocks.join("");
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
  // painéis de futuros ligados: busca junto com as velas (e o spinner dos checkboxes aparece já), em vez
  // de esperar as velas chegarem para o render pedir
  if (view.asset && futPanesOn().length && view.fut?.key !== futKey()) loadFutures();

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
      // além da janela, busca as velas que as médias móveis precisam para já começar preenchidas
      const warmup = maxMaPeriod();
      if (points[0].time <= win.fromMs - warmup * INTERVAL_MS[interval] || points.length >= MAX_CANDLES + warmup) break;
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

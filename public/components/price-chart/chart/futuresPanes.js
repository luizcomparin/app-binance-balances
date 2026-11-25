// Painéis abaixo do gráfico de preço (mesmo eixo de tempo: zoom, arrasto e mira sincronizados):
// (na mesma ordem dos checkboxes de "Painéis abaixo do gráfico", nas Camadas)
//   1. Volume (USDT)   2. CVD / Delta de volume   3. RSI   4. MACD (os quatro com engrenagem de configurações)
//   5. Liquidações reais (longs e shorts liquidados em US$)
//   6. Open interest (USDT)   7. Long/Short (% comprados: contas e top traders)   8. Taxa de funding
// Os de futuros vêm em períodos próprios (1h/4h/1d e funding a cada 8h) e são encaixados nas velas do gráfico.
import { formatUsdShort } from "../../../core/format.js";
import { toChartTime } from "./axis.js";
import { movingAverage, maColor, maLabel } from "./movingAverage.js";
import { volumeDelta } from "./cvd.js";
import { rsi, rsiMovingAverage } from "./rsi.js";
import { macd, macdHistogramTones } from "./macd.js";

const LWC = window.LightweightCharts;
const PANE_HEIGHT = 96;
// altura padrão de painéis que precisam de mais espaço (o RSI vai de 0 a 100 com linhas de nível)
export const PANE_DEFAULT_HEIGHTS = { rsi: 150, macd: 130 };

const GEAR =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// painéis com engrenagem de configurações no título (o conteúdo vem de handlers.mountSettings)
const SETTINGS_PANES = ["volume", "cvd", "rsi", "macd"];

// passado no lugar dos dados enquanto carregam: o painel continua no lugar, vazio e com spinner
export const PANE_LOADING = Object.freeze({ loading: true });

const COLORS = {
  volumeUp: "rgba(82, 255, 168, 0.5)",
  volumeDown: "rgba(255, 114, 114, 0.5)",
  oi: "#a78bfa",
  global: "#ffd166",
  top: "#4dd4ff",
  fundingUp: "rgba(82, 255, 168, 0.8)",
  fundingDown: "rgba(255, 114, 114, 0.8)",
  liqLong: "rgba(255, 114, 114, 0.85)",
  liqShort: "rgba(82, 255, 168, 0.85)",
  deltaUp: [82, 255, 168],
  deltaDown: [255, 114, 114],
};

// Dicas (hover no título de cada painel)
export const FUTURES_HELP = {
  volume: [
    "Quanto foi negociado em cada vela, em USDT (mercado à vista).",
    "Verde: a vela fechou em alta. Vermelho: fechou em baixa.",
    "",
    "Leia junto com o preço:",
    "• Movimento com volume alto: tem força, muita gente participando.",
    "• Movimento com volume baixo: fraco, mais fácil de reverter.",
    "• Pico de volume numa queda forte: muita gente vendendo de uma vez (capitulação), às vezes perto de fundo.",
  ].join("\n"),
  oi: [
    "Valor total dos contratos em aberto nos futuros.",
    "",
    "Leia junto com o preço:",
    "• Preço ↑ + OI ↑: dinheiro novo entrando comprado (alta com força).",
    "• Preço ↓ + OI ↑: dinheiro novo entrando vendido (queda com força).",
    "• Preço ↑ + OI ↓: shorts fechando ou sendo liquidados (short squeeze, alta sem dinheiro novo, costuma perder fôlego).",
    "• Preço ↓ + OI ↓: longs desistindo ou sendo liquidados (capitulação, às vezes perto de fundo).",
    "",
    "Quedas bruscas de OI marcam ondas de liquidação.",
  ].join("\n"),
  ls: [
    "% de comprados entre:",
    "• Contas: todas as contas (em geral, o varejo).",
    "• Top traders: os maiores traders, pesando o tamanho da posição.",
    "",
    "Como ler:",
    "• Varejo muito comprado (75% ou mais) é sinal de alerta: há muitos longs para serem liquidados se o preço cair.",
    "• Top traders bem menos comprados que o varejo: os grandes não estão acompanhando a euforia.",
  ].join("\n"),
  funding: [
    "Taxa que um lado paga ao outro a cada 8h.",
    "• Positiva: quem está comprado paga → muita gente apostando na alta.",
    "• Negativa: quem está vendido paga → muita gente apostando na queda.",
    "• Normal: perto de +0,01%. Valores muito acima ou abaixo costumam aparecer perto de viradas.",
  ].join("\n"),
  cvd: [
    "Quem está mais agressivo: compradores ou vendedores (mercado à vista, em USDT).",
    "• Delta da vela: compras a mercado − vendas a mercado. Positivo = predominou compra agressiva.",
    "• CVD: soma dos deltas desde a primeira vela carregada. Vale a direção da linha, não o nível.",
    "",
    "Leia junto com o preço:",
    "• Preço ↑ + CVD ↑: alta puxada por compra real.",
    "• Preço ↑ + CVD ↓ ou parado: alta sem compra agressiva por trás (divergência), tende a ser frágil.",
    "• Preço ↓ + CVD ↑ ou parado: venda perdendo força ou compras sendo absorvidas (divergência de alta).",
    "• Preço lateral + CVD subindo forte: compradores batendo numa parede de venda (absorção).",
    "",
    "Não é sinal de entrada sozinho: divergências podem durar bastante.",
  ].join("\n"),
  rsi: [
    "Índice de Força Relativa (0 a 100): compara o tamanho das altas com o das baixas nas últimas N velas.",
    "• Acima da linha de sobrecompra (padrão 70): subiu rápido demais, pode corrigir.",
    "• Abaixo da linha de sobrevenda (padrão 30): caiu rápido demais, pode repicar.",
    "• Acima de 50: altas mais fortes que as baixas; abaixo de 50: o contrário.",
    "",
    "Leia junto com o preço:",
    "• Preço faz topo mais alto e o RSI, topo mais baixo: alta perdendo força (divergência de baixa).",
    "• Preço faz fundo mais baixo e o RSI, fundo mais alto: queda perdendo força (divergência de alta).",
    "",
    "Em tendência forte o RSI pode ficar muito tempo sobrecomprado ou sobrevendido: não é sinal de entrada sozinho.",
  ].join("\n"),
  macd: [
    "MACD: diferença entre uma média rápida e uma lenta do preço (padrão: EMA 12 − EMA 26). Mede a força e a direção da tendência.",
    "• Linha MACD (azul) e linha de sinal (laranja, a média do MACD, padrão 9).",
    "• Histograma: MACD − sinal. Barras crescendo = a tendência ganhando força; diminuindo (tom mais claro) = perdendo força.",
    "",
    "Como ler:",
    "• MACD cruza o sinal para cima: força compradora aumentando. Para baixo: força vendedora aumentando.",
    "• MACD acima de zero: média rápida acima da lenta (viés de alta); abaixo de zero: viés de baixa.",
    "• Preço faz topo mais alto e o MACD, topo mais baixo: alta perdendo força (divergência).",
    "",
    "É um indicador atrasado (usa médias): confirma tendências, não as antecipa. Em mercado lateral dá muitos cruzamentos falsos.",
  ].join("\n"),
  liq: [
    "Liquidações que de fato aconteceram nos futuros perpétuos (Binance + Bybit + OKX, dados da Coinalyze), em US$.",
    "• Vermelho para cima: posições compradas (long) liquidadas, ou seja, vendas forçadas.",
    "• Verde para baixo: posições vendidas (short) liquidadas, ou seja, compras forçadas.",
    "",
    "Como ler:",
    "• Pico de longs liquidados numa queda: cascata de vendas forçadas, que muitas vezes marca um fundo de curto prazo.",
    "• Pico de shorts liquidados numa alta: short squeeze, que muitas vezes marca um topo de curto prazo.",
    "",
    "Em velas de 1h e 4h o histórico é curto (a Coinalyze guarda pouco tempo de dado intradiário).",
  ].join("\n"),
};

// alturas escolhidas na divisória dos painéis, salvas no navegador: { volume: px, oi: px, ... }
const HEIGHTS_KEY = "priceChartPaneHeights";

function readPaneHeights() {
  try {
    const raw = JSON.parse(localStorage.getItem(HEIGHTS_KEY) || "{}");
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) if (Number.isFinite(v) && v > 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function writePaneHeights(heights) {
  try {
    localStorage.setItem(HEIGHTS_KEY, JSON.stringify(heights));
  } catch {}
}

const pct = (v, digits = 1) => `${(v * 100).toFixed(digits).replace(".", ",")}%`;
const fundingPct = (r) => `${r > 0 ? "+" : ""}${(r * 100).toFixed(4).replace(".", ",")}%`;

// índice da vela que contém o instante t (última vela com time <= t); -1 se antes do gráfico
function barIndex(points, t) {
  if (!points.length || t < points[0].time) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Encaixa `rows` ({ t, ... }) nas velas: valor por vela (ou null).
 * mode "last" = último valor da vela; "avg" = média; "ffill" = último valor e repete nas velas seguintes
 * até o próximo (funding em velas menores que o intervalo de cobrança).
 */
function alignToBars(points, rows, get, mode) {
  const values = new Array(points.length).fill(null);
  const sums = new Array(points.length).fill(0);
  const counts = new Array(points.length).fill(0);
  for (const row of rows) {
    const i = barIndex(points, row.t);
    if (i < 0) continue;
    const v = get(row);
    values[i] = v;
    sums[i] += v;
    counts[i] += 1;
  }
  if (mode === "avg") return values.map((v, i) => (counts[i] ? sums[i] / counts[i] : null));
  if (mode === "sum") return values.map((v, i) => (counts[i] ? sums[i] : null));
  if (mode === "ffill") {
    let last = null;
    return values.map((v) => (v === null ? last : (last = v)));
  }
  return values;
}

// painéis de futuros, na ordem do gráfico (cada um ligado por um checkbox próprio)
export const FUTURES_PANES = ["oi", "ls", "funding"];

/** handlers = { mountSettings(key, el) }: preenche a caixa de configurações do painel key (volume, cvd) */
export function createFuturesPanes(chart, wrap, handlers = {}) {
  // vol = série de volume (painel 1, quando ligado); series = séries de futuros (um painel para cada item de shown, os
  // últimos; só com dados de futuros); shown = painéis de futuros criados, na ordem do gráfico
  // vmas = médias do volume (id -> { series, key, values, m }), no painel de volume
  // liq = séries de liquidações reais ({ long, short }, logo antes dos de futuros), liqData = resposta de /liquidations,
  // liqAligned = valores por vela ({ long, short, by })
  const st = {
    vol: null,
    vmas: new Map(),
    series: null,
    shown: [],
    aligned: null,
    data: null,
    liq: null,
    liqData: null,
    liqAligned: null,
    cvd: null, // série do CVD/Delta (painel logo depois do volume)
    cvdType: null, // "CVD" | "DELTA" da série atual
    cvdM: null, // configurações ({ type, color, opacity })
    cvdVals: null, // { delta, cvd } por vela
    cvdKey: null, // velas + cor + opacidade dos dados desenhados
    rsi: null, // série do RSI (painel logo depois do CVD)
    rsiM: null, // configurações ({ period, overbought, oversold, color, opacity })
    rsiVals: null, // RSI por vela
    rsiMa: null, // série da média móvel do RSI (mesmo painel; só com ela ligada)
    rsiMaVals: null, // média do RSI por vela
    rsiMaKey: null, // RSI + tipo + período da média desenhada
    rsiKey: null, // velas + período dos dados desenhados
    rsiLines: [], // linhas de sobrecompra, 50 e sobrevenda
    rsiLinesKey: null, // níveis e aparência das linhas desenhadas
    macd: null, // séries do MACD ({ hist, line, signal }, painel logo depois do RSI)
    macdM: null, // configurações (chart/macd.js → MACD_DEFAULT)
    macdVals: null, // { macd, signal, hist } por vela
    macdKey: null, // velas + parâmetros + cores dos dados desenhados
    points: null,
    interval: null,
  };

  // títulos dos painéis (HTML por cima do gráfico, com dica no hover): volume, CVD, OI, long/short, funding,
  // liquidações. texts = onde vão o nome e os valores (no volume e no CVD, um trecho antes da engrenagem;
  // a caixa de configurações fica fora dele para não ser redesenhada a cada movimento da mira)
  const titles = {};
  const texts = {};
  for (const key of ["volume", "cvd", "rsi", "macd", "oi", "ls", "funding", "liq"]) {
    const el = document.createElement("div");
    el.className = "fp-title";
    el.hidden = true;
    wrap.appendChild(el);
    titles[key] = el;
    texts[key] = el;
    if (!SETTINGS_PANES.includes(key) || !handlers.mountSettings) continue;
    el.innerHTML = `<span class="fp-title-text"></span><button type="button" class="fp-gear" title="Configurações do painel" aria-label="Configurações do painel" aria-expanded="false">${GEAR}</button><div class="fp-settings fp-settings-${key}" hidden></div>`;
    texts[key] = el.querySelector(".fp-title-text");
    handlers.mountSettings(key, el.querySelector(".fp-settings"));
    el.querySelector(".fp-gear").addEventListener("click", () => toggleSettings(key));
  }

  // caixa de configurações aberta pela engrenagem (uma por vez); clique fora ou Esc fecha
  function toggleSettings(key, open = !!key && titles[key].querySelector(".fp-settings").hidden) {
    for (const k of SETTINGS_PANES) {
      const box = titles[k].querySelector(".fp-settings");
      if (!box) continue;
      const on = k === key && open;
      box.hidden = !on;
      titles[k].classList.toggle("settings-open", on);
      titles[k].querySelector(".fp-gear").setAttribute("aria-expanded", String(on));
    }
  }
  if (handlers.mountSettings) {
    // (o seletor de cor do navegador fecha com um clique fora: isso não fecha a caixa, só o seletor)
    document.addEventListener("click", (e) => {
      if (e.target.isConnected && !e.target.closest(".fp-title.settings-open")) toggleSettings(null, false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.target.closest?.(".pcm-pop")) toggleSettings(null, false);
    });
  }
  // spinner centralizado no painel enquanto os dados dele carregam (o volume vem junto com as velas)
  const loaders = {};
  for (const key of ["oi", "ls", "funding", "liq"]) {
    const el = document.createElement("div");
    el.className = "fp-loading mini-spinner";
    el.hidden = true;
    wrap.appendChild(el);
    loaders[key] = el;
  }
  const isLoading = (key) => (key === "liq" ? st.liqData : st.data) === PANE_LOADING;
  const hideTitles = (keys = Object.keys(titles)) =>
    keys.forEach((k) => {
      titles[k].hidden = true;
      if (loaders[k]) loaders[k].hidden = true;
    });

  // arrastar a divisória entre painéis muda a altura deles sem mudar o tamanho do gráfico:
  // observa cada painel para os títulos acompanharem
  let titlesFrame = 0;
  const schedulePositionTitles = () => {
    cancelAnimationFrame(titlesFrame);
    titlesFrame = requestAnimationFrame(positionTitles);
  };
  const paneObserver = new ResizeObserver(schedulePositionTitles);
  const observedPanes = new WeakSet();

  function positionTitles() {
    const panes = chart.panes();
    const wrapTop = wrap.getBoundingClientRect().top;
    for (const pane of panes) {
      const paneEl = pane.getHTMLElement();
      if (paneEl && !observedPanes.has(paneEl)) {
        observedPanes.add(paneEl);
        // o painel é uma linha de tabela: observa também as células (sempre têm caixa própria)
        for (const node of [paneEl, ...paneEl.children]) paneObserver.observe(node);
      }
    }
    const keys = subKeys();
    for (const [key, el] of Object.entries(titles)) {
      const k = keys.indexOf(key);
      const pane = k >= 0 ? panes[k + 1] : null;
      const paneEl = pane ? pane.getHTMLElement() : null;
      el.hidden = !paneEl;
      if (paneEl) el.style.top = `${paneEl.getBoundingClientRect().top - wrapTop + 4}px`;
      const loader = loaders[key];
      if (!loader) continue;
      loader.hidden = !paneEl || !isLoading(key);
      if (!loader.hidden) {
        const rect = paneEl.getBoundingClientRect();
        const width = chart.paneSize(k + 1)?.width ?? rect.width;
        loader.style.top = `${rect.top - wrapTop + rect.height / 2}px`;
        loader.style.left = `${width / 2}px`;
      }
    }
  }

  // painéis de baixo em uso, na ordem do gráfico
  const subKeys = () => [
    ...(st.vol ? ["volume"] : []),
    ...(st.cvd ? ["cvd"] : []),
    ...(st.rsi ? ["rsi"] : []),
    ...(st.macd ? ["macd"] : []),
    ...(st.liq ? ["liq"] : []),
    ...st.shown,
  ];
  // quantos painéis abaixo do preço devem existir
  const subCount = () => subKeys().length;
  // painéis antes dos de futuros: volume, CVD, RSI, MACD e liquidações, quando ligados (nessa ordem, a partir do painel 1)
  const volCount = () => (st.vol ? 1 : 0);
  const cvdCount = () => (st.cvd ? 1 : 0);
  const rsiCount = () => (st.rsi ? 1 : 0);
  const macdCount = () => (st.macd ? 1 : 0);
  const liqCount = () => (st.liq ? 1 : 0);

  // altura (px) de cada painel de baixo: PANE_HEIGHT até o usuário arrastar a divisória; daí fica a
  // escolhida (vale ao trocar de moeda, ligar/desligar futuros, redimensionar a janela e recarregar a página)
  const paneHeights = readPaneHeights();
  const heightOf = (key) => paneHeights[key] ?? PANE_DEFAULT_HEIGHTS[key] ?? PANE_HEIGHT;

  // painéis de baixo com a altura guardada; o painel de preço fica com o resto. Reaplicada sempre que o
  // gráfico muda de tamanho (a biblioteca redistribui as alturas proporcionalmente ao redimensionar)
  // (setHeight de um painel redistribui os outros; com as proporções de todos de uma vez fica exato)
  function applyHeights() {
    const keys = subKeys();
    if (!keys.length) return;
    const panes = chart.panes();
    if (panes.length < keys.length + 1) return;
    const subs = panes.slice(1, keys.length + 1);
    if (subs.every((p, i) => Math.abs(p.getHeight() - heightOf(keys[i])) <= 1)) return;
    const total = panes.reduce((sum, p) => sum + p.getHeight(), 0);
    const wanted = keys.reduce((sum, k) => sum + heightOf(k), 0);
    const main = Math.max(PANE_HEIGHT, total - wanted);
    panes[0].setStretchFactor(main);
    subs.forEach((p, i) => p.setStretchFactor(heightOf(keys[i])));
  }

  // fim de um arraste no gráfico (pode ter sido na divisória): guarda as alturas atuais dos painéis
  let pointerInChart = false;
  wrap.addEventListener("pointerdown", () => (pointerInChart = true), true);
  window.addEventListener(
    "pointerup",
    () => {
      if (!pointerInChart) return;
      pointerInChart = false;
      requestAnimationFrame(() => {
        const keys = subKeys();
        const panes = chart.panes();
        if (!keys.length || panes.length !== keys.length + 1) return;
        let changed = false;
        keys.forEach((k, i) => {
          const h = panes[i + 1].getHeight();
          if (Math.abs(h - heightOf(k)) > 1) {
            paneHeights[k] = h;
            changed = true;
          }
        });
        if (changed) writePaneHeights(paneHeights);
      });
    },
    true
  );
  const relayout = () =>
    requestAnimationFrame(() =>
      setTimeout(() => {
        applyHeights();
        requestAnimationFrame(positionTitles);
      }, 0)
    );
  new ResizeObserver(relayout).observe(wrap);

  const usd = { type: "custom", minMove: 1, formatter: (v) => formatUsdShort(Math.abs(v)) };
  const base = { priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false };

  function createVolume() {
    st.vol = chart.addSeries(LWC.HistogramSeries, { ...base, priceFormat: usd, base: 0 }, 1);
    relayout();
  }

  // painel de liquidações: depois do volume, do CVD, do RSI e do MACD, antes dos de futuros (que saem e voltam depois dele
  // quando ele entra ou sai: withFuturesMoved)
  function createLiquidationSeries() {
    const pane = 1 + volCount() + cvdCount() + rsiCount() + macdCount();
    // sem etiqueta de último valor no eixo (as duas se sobrepõem; os valores já estão no título)
    const opts = { ...base, lastValueVisible: false, priceFormat: usd, base: 0 };
    st.liq = {
      long: chart.addSeries(LWC.HistogramSeries, { ...opts, color: COLORS.liqLong }, pane),
      short: chart.addSeries(LWC.HistogramSeries, { ...opts, color: COLORS.liqShort }, pane),
    };
    if (st.liqAligned) setLiquidationData();
    relayout();
  }

  function removeLiquidationSeries() {
    if (!st.liq) return;
    chart.removeSeries(st.liq.long);
    chart.removeSeries(st.liq.short);
    st.liq = null;
  }

  // muda os painéis que vêm antes dos de futuros (fn) tirando os de futuros e recolocando-os depois, por
  // último, com os dados que já tinham
  function withFuturesMoved(fn) {
    const keys = st.series ? [...st.shown] : [];
    removeFuturesSeries();
    fn();
    if (!keys.length) return;
    addFuturesSeries(keys);
    if (st.data && st.data !== PANE_LOADING) setData();
  }

  function removeLiquidations() {
    if (!st.liq && !st.liqData) return;
    withFuturesMoved(() => {
      removeLiquidationSeries();
      removeEmptyPanes();
    });
    st.liqData = null;
    st.liqAligned = null;
    hideTitles(["liq"]);
  }

  // soma as liquidações de cada vela (vela diária ou maior soma os dias; 1h/4h é 1 para 1)
  function alignLiquidations() {
    const { liqData, points } = st;
    const long = alignToBars(points, liqData.rows, (r) => r.long, "sum");
    const short = alignToBars(points, liqData.rows, (r) => r.short, "sum");
    // dentro do período coberto, vela sem linha = nenhuma liquidação (a Coinalyze pode omitir períodos zerados)
    const first = long.findIndex((v) => v !== null);
    const last = long.findLastIndex((v) => v !== null);
    for (let i = first; first >= 0 && i <= last; i++) {
      long[i] ??= 0;
      short[i] ??= 0;
    }
    const by = new Array(points.length).fill(null);
    for (const row of liqData.rows) {
      const i = barIndex(points, row.t);
      if (i < 0) continue;
      by[i] ||= {};
      for (const [name, v] of Object.entries(row.by || {})) {
        by[i][name] ||= { long: 0, short: 0 };
        by[i][name].long += v.long;
        by[i][name].short += v.short;
      }
    }
    st.liqAligned = { long, short, by };
  }

  function setLiquidationData() {
    const { points, interval } = st;
    const times = points.map((p) => toChartTime(p.time, interval));
    const { long, short } = st.liqAligned;
    // (== null: logo depois de trocar as velas, os valores ainda podem ser das velas anteriores)
    st.liq.long.setData(times.map((time, i) => (long[i] == null ? { time } : { time, value: long[i] })));
    st.liq.short.setData(times.map((time, i) => (short[i] == null ? { time } : { time, value: -short[i] })));
  }

  // (re)cria os painéis de futuros pedidos (keys, subconjunto de FUTURES_PANES, na ordem do gráfico)
  function createSeries(keys) {
    removeFuturesSeries();
    addFuturesSeries(keys);
  }

  function addFuturesSeries(keys) {
    removeEmptyPanes(); // sobra de painéis que estavam depois do volume
    const percent = { type: "custom", minMove: 0.001, formatter: (v) => `${Math.round(v)}%` };
    const fundingFmt = { type: "custom", minMove: 0.000001, formatter: (v) => `${v.toFixed(3).replace(".", ",")}%` };
    st.series = {};
    keys.forEach((key, k) => {
      const pane = 1 + volCount() + cvdCount() + rsiCount() + macdCount() + liqCount() + k;
      if (key === "oi") {
        st.series.oi = chart.addSeries(
          LWC.AreaSeries,
          { ...base, lineColor: COLORS.oi, topColor: "rgba(167, 139, 250, 0.25)", bottomColor: "rgba(167, 139, 250, 0.02)", lineWidth: 2, priceFormat: usd },
          pane
        );
      } else if (key === "ls") {
        st.series.global = chart.addSeries(LWC.LineSeries, { ...base, color: COLORS.global, lineWidth: 2, priceFormat: percent }, pane);
        st.series.top = chart.addSeries(LWC.LineSeries, { ...base, color: COLORS.top, lineWidth: 2, priceFormat: percent }, pane);
        st.series.global.createPriceLine({ price: 50, color: "rgba(155, 176, 214, 0.4)", lineWidth: 1, lineStyle: LWC.LineStyle.Dashed, axisLabelVisible: false });
      } else if (key === "funding") {
        st.series.funding = chart.addSeries(LWC.HistogramSeries, { ...base, priceFormat: fundingFmt, base: 0 }, pane);
      }
    });
    st.shown = [...keys];
    relayout(); // alturas depois do layout (o gráfico acabou de crescer para caber os painéis)
  }

  // tira só as séries de futuros (sem mexer nos dados nem no painel de liquidações)
  function removeFuturesSeries() {
    if (!st.series) return;
    for (const s of Object.values(st.series)) chart.removeSeries(s);
    st.series = null;
    st.shown = [];
    removeEmptyPanes();
  }

  // painéis vazios que sobrarem depois dos que estão em uso
  function removeEmptyPanes() {
    for (let i = chart.panes().length - 1; i > subCount(); i--) chart.removePane(i);
  }

  function removeFutures() {
    if (!st.series) return;
    removeFuturesSeries();
    st.aligned = null;
    st.data = null;
    hideTitles(FUTURES_PANES);
  }

  function removeVolumeAverage(id) {
    chart.removeSeries(st.vmas.get(id).series);
    st.vmas.delete(id);
  }

  // médias móveis do volume visíveis ([{ id, period, type, color, opacity }]); recalcula só quando mudam
  // as velas ou os parâmetros
  function setVolumeAverages(list) {
    const ids = new Set(st.vol ? list.map((m) => m.id) : []);
    for (const id of [...st.vmas.keys()]) if (!ids.has(id)) removeVolumeAverage(id);
    if (!st.vol) return;
    for (const m of list) {
      let v = st.vmas.get(m.id);
      if (!v) {
        v = { series: chart.addSeries(LWC.LineSeries, { ...base, lineWidth: 2, priceFormat: usd }, 1) };
        st.vmas.set(m.id, v);
      }
      v.m = m;
      v.series.applyOptions({ color: maColor(m), title: maLabel(m) });
      const key = `${m.type}|${m.period}`;
      if (v.points === st.points && v.key === key) continue;
      v.points = st.points;
      v.key = key;
      v.values = movingAverage(st.points, m.period, m.type, "volume");
      v.series.setData(
        st.points.map((p, i) => {
          const time = toChartTime(p.time, st.interval);
          return v.values[i] === null ? { time } : { time, value: v.values[i] };
        })
      );
    }
    renderTitles();
  }

  const signedUsd = (v) => `${v < 0 ? "−" : ""}${formatUsdShort(Math.abs(v))}`;
  const deltaColor = (v, opacity) => `rgba(${(v >= 0 ? COLORS.deltaUp : COLORS.deltaDown).join(", ")}, ${0.8 * opacity})`;

  function createCvdSeries(m) {
    const opts = { ...base, priceFormat: { type: "custom", minMove: 1, formatter: signedUsd } };
    const pane = 1 + volCount();
    st.cvd =
      m.type === "DELTA"
        ? chart.addSeries(LWC.HistogramSeries, { ...opts, base: 0 }, pane)
        : chart.addSeries(LWC.LineSeries, { ...opts, lineWidth: 2 }, pane);
    st.cvdType = m.type;
    st.cvdM = m;
    st.cvdKey = null;
  }

  function removeCvdSeries() {
    if (st.cvd) chart.removeSeries(st.cvd);
    st.cvd = null;
    st.cvdType = null;
    st.cvdKey = null;
  }

  function removeVolumeSeries() {
    for (const id of [...st.vmas.keys()]) removeVolumeAverage(id);
    if (st.vol) chart.removeSeries(st.vol);
    st.vol = null;
  }

  // escala do RSI ajustada aos valores visíveis (zoom vertical), mas sempre com as linhas de sobrecompra e
  // sobrevenda dentro dela; margens pequenas (RSI_MARGINS) para a linha usar a altura do painel. As margens
  // são aplicadas por createChart (syncPriceScales), que confere as de todos os painéis a cada update
  const rsiPane = () => 1 + volCount() + cvdCount();
  const RSI_MARGINS = { top: 0.06, bottom: 0.06 };
  const rsiLineOptions = {
    ...base,
    lineWidth: 2,
    priceFormat: { type: "custom", minMove: 0.01, formatter: (v) => String(Math.round(v)) },
    autoscaleInfoProvider: (original) => {
      const r = original();
      if (!r?.priceRange) return r;
      const { overbought = 70, oversold = 30 } = st.rsiM || {};
      return {
        ...r,
        priceRange: {
          minValue: Math.max(0, Math.min(r.priceRange.minValue, oversold)),
          maxValue: Math.min(100, Math.max(r.priceRange.maxValue, overbought)),
        },
      };
    },
  };

  function createRsiSeries(m) {
    st.rsi = chart.addSeries(LWC.LineSeries, rsiLineOptions, rsiPane());
    st.rsiM = m;
    st.rsiKey = null;
    st.rsiLines = [];
    st.rsiLinesKey = null;
  }

  function removeRsiMa() {
    if (st.rsiMa) chart.removeSeries(st.rsiMa);
    st.rsiMa = null;
    st.rsiMaVals = null;
    st.rsiMaKey = null;
  }

  function removeRsiSeries() {
    removeRsiMa();
    if (st.rsi) chart.removeSeries(st.rsi);
    st.rsi = null;
    st.rsiKey = null;
    st.rsiLines = [];
    st.rsiLinesKey = null;
  }

  // estado atual dos painéis de cima (para rebuildTop mudar só um deles)
  const topState = () => ({
    volume: !!st.vol,
    cvd: st.cvd ? st.cvdM : null,
    rsi: st.rsi ? st.rsiM : null,
    macd: st.macd ? st.macdM : null,
  });

  // liga/desliga o volume (volume: bool), o CVD, o RSI e o MACD (configurações ou null), que ficam nessa ordem
  // logo abaixo do preço: o de liquidações e os de futuros saem e voltam depois deles, com os dados que já tinham
  // (as séries recriadas são redesenhadas na hora: o setCvd/setRsi/setMacd desta renderização pode já ter passado)
  function rebuildTop({ volume, cvd, rsi: rsiM, macd: macdM }) {
    withFuturesMoved(() => {
      const hadLiq = !!st.liq;
      removeLiquidationSeries();
      removeMacdSeries();
      removeRsiSeries();
      removeCvdSeries();
      if (!volume) removeVolumeSeries();
      removeEmptyPanes();
      if (volume && !st.vol) createVolume();
      if (cvd) createCvdSeries(cvd);
      if (rsiM) createRsiSeries(rsiM);
      if (macdM) createMacdSeries(macdM);
      if (hadLiq) createLiquidationSeries();
    });
    drawCvd();
    drawRsi();
    drawMacd();
    relayout();
  }

  // ---- MACD: histograma (atrás), linha MACD e linha de sinal no mesmo painel, com uma linha em zero ----

  // valores do MACD têm a grandeza do preço (BTC: centenas; moedas baratas: 0,0000x): casas decimais conforme o valor
  function macdNum(v) {
    if (v == null) return "--";
    const a = Math.abs(v);
    const digits = a >= 100 ? 1 : a >= 1 ? 2 : Math.min(10, Math.max(2, Math.ceil(-Math.log10(a || 1)) + 2));
    return `${v < 0 ? "−" : ""}${a.toFixed(digits).replace(".", ",")}`;
  }

  function createMacdSeries(m) {
    const pane = 1 + volCount() + cvdCount() + rsiCount();
    const opts = { ...base, priceFormat: { type: "custom", minMove: 1e-10, formatter: macdNum } };
    st.macd = {
      hist: chart.addSeries(LWC.HistogramSeries, { ...opts, lastValueVisible: false, base: 0 }, pane),
      line: chart.addSeries(LWC.LineSeries, { ...opts, lineWidth: 2 }, pane),
      signal: chart.addSeries(LWC.LineSeries, { ...opts, lineWidth: 2 }, pane),
    };
    st.macd.line.createPriceLine({ price: 0, color: "rgba(155, 176, 214, 0.35)", lineWidth: 1, lineStyle: LWC.LineStyle.Dotted, axisLabelVisible: false });
    st.macdM = m;
    st.macdKey = null;
  }

  function removeMacdSeries() {
    if (st.macd) for (const series of Object.values(st.macd)) chart.removeSeries(series);
    st.macd = null;
    st.macdKey = null;
  }

  // painel do MACD: configurações (chart/macd.js) ou null (desligado)
  function setMacd(m) {
    if (!st.points) m = null;
    if (!!m !== !!st.macd) rebuildTop({ ...topState(), macd: m });
    st.macdM = m;
    if (!m) {
      st.macdVals = null;
      return;
    }
    drawMacd();
    renderTitles();
  }

  // desenha o MACD com as configurações e as velas atuais (só refaz os dados se algo mudou)
  function drawMacd() {
    const m = st.macdM;
    if (!st.macd || !m || !st.points) return;
    st.macd.line.applyOptions({ color: m.macdColor });
    st.macd.signal.applyOptions({ color: m.signalColor });
    const key = [m.fast, m.slow, m.signal, m.oscType, m.signalType, m.showHist, m.histUpColor, m.histDownColor, m.histOpacity].join("|");
    if (st.macdKey?.points === st.points && st.macdKey.key === key) return;
    st.macdKey = { points: st.points, key };
    st.macdVals = macd(st.points, m);
    const { macd: line, signal, hist } = st.macdVals;
    const times = st.points.map((p) => toChartTime(p.time, st.interval));
    const lineData = (values) => times.map((time, i) => (values[i] === null ? { time } : { time, value: values[i] }));
    st.macd.line.setData(lineData(line));
    st.macd.signal.setData(lineData(signal));
    // histograma: tom forte quando se afasta de zero, mais claro quando volta (como no TradingView)
    const tones = macdHistogramTones(hist);
    st.macd.hist.setData(
      m.showHist
        ? times.map((time, i) => {
            const t = tones[i];
            if (!t) return { time };
            const color = maColor({ color: t.up ? m.histUpColor : m.histDownColor, opacity: m.histOpacity * (t.strong ? 1 : 0.45) });
            return { time, value: hist[i], color };
          })
        : []
    );
  }

  // painel do RSI: configurações ({ period, overbought, oversold, color, opacity }) ou null (desligado);
  // recalcula só quando mudam as velas ou o período; as linhas, só quando mudam os níveis
  function setRsi(m) {
    if (!st.points) m = null;
    if (!!m !== !!st.rsi) rebuildTop({ ...topState(), rsi: m });
    st.rsiM = m;
    if (!m) {
      st.rsiVals = null;
      return;
    }
    drawRsi();
    renderTitles();
  }

  // desenha o RSI com as configurações e as velas atuais (só refaz linhas e dados se mudaram)
  function drawRsi() {
    const m = st.rsiM;
    if (!st.rsi || !m || !st.points) return;
    st.rsi.applyOptions({ color: maColor(m) });
    // linhas de nível: refeitas só quando muda um nível ou a aparência
    const linesKey = [m.overbought, m.oversold, m.overboughtColor, m.oversoldColor, m.lineStyle, m.lineWidth, m.levelOpacity, m.showMid].join("|");
    if (st.rsiLinesKey !== linesKey) {
      for (const line of st.rsiLines) st.rsi.removePriceLine(line);
      const style = { solid: LWC.LineStyle.Solid, dashed: LWC.LineStyle.Dashed, dotted: LWC.LineStyle.Dotted }[m.lineStyle];
      const line = (price, color, lineStyle = style) =>
        st.rsi.createPriceLine({ price, color, lineWidth: m.lineWidth, lineStyle, axisLabelVisible: false });
      st.rsiLines = [
        line(m.overbought, maColor({ color: m.overboughtColor, opacity: m.levelOpacity })),
        ...(m.showMid ? [line(50, maColor({ color: "#9bb0d6", opacity: m.levelOpacity / 2 }), LWC.LineStyle.Dotted)] : []),
        line(m.oversold, maColor({ color: m.oversoldColor, opacity: m.levelOpacity })),
      ];
      st.rsiLinesKey = linesKey;
    }
    if (st.rsiKey?.points !== st.points || st.rsiKey.period !== m.period) {
      st.rsiKey = { points: st.points, period: m.period };
      st.rsiVals = rsi(st.points, m.period);
      st.rsi.setData(
        st.points.map((p, i) => {
          const time = toChartTime(p.time, st.interval);
          return st.rsiVals[i] === null ? { time } : { time, value: st.rsiVals[i] };
        })
      );
    }
    drawRsiMa();
  }

  // média móvel do RSI (no mesmo painel e na mesma escala); recalcula quando muda o RSI, o tipo ou o período
  function drawRsiMa() {
    const m = st.rsiM;
    if (!m.maOn) return removeRsiMa();
    if (!st.rsiMa) st.rsiMa = chart.addSeries(LWC.LineSeries, { ...rsiLineOptions, lineWidth: 1 }, rsiPane());
    st.rsiMa.applyOptions({ color: maColor({ color: m.maColor, opacity: m.opacity }) });
    if (st.rsiMaKey?.vals === st.rsiVals && st.rsiMaKey.type === m.maType && st.rsiMaKey.period === m.maPeriod) return;
    st.rsiMaKey = { vals: st.rsiVals, type: m.maType, period: m.maPeriod };
    st.rsiMaVals = rsiMovingAverage(st.rsiVals, m.maPeriod, m.maType);
    st.rsiMa.setData(
      st.points.map((p, i) => {
        const time = toChartTime(p.time, st.interval);
        return st.rsiMaVals[i] === null ? { time } : { time, value: st.rsiMaVals[i] };
      })
    );
  }

  // painel de CVD/Delta: configurações ({ type: "CVD"|"DELTA", color, opacity }) ou null (desligado);
  // recalcula só quando mudam as velas (ou, no Delta, a opacidade, que vai na cor de cada barra)
  function setCvd(m) {
    if (!st.points) m = null;
    if ((m ? m.type : null) !== st.cvdType) rebuildTop({ ...topState(), cvd: m });
    st.cvdM = m;
    if (!m) {
      st.cvdVals = null;
      return;
    }
    drawCvd();
    renderTitles();
  }

  // desenha o CVD com as configurações e as velas atuais (só refaz os dados se mudaram)
  function drawCvd() {
    const m = st.cvdM;
    if (!st.cvd || !m || !st.points) return;
    if (m.type === "CVD") st.cvd.applyOptions({ color: maColor(m) });
    const key = m.type === "DELTA" ? m.opacity : "";
    if (st.cvdKey?.points === st.points && st.cvdKey.key === key) return;
    st.cvdKey = { points: st.points, key };
    st.cvdVals = volumeDelta(st.points);
    const values = m.type === "DELTA" ? st.cvdVals.delta : st.cvdVals.cvd;
    st.cvd.setData(
      st.points.map((p, i) => {
        const time = toChartTime(p.time, st.interval);
        const v = values[i];
        if (v === null) return { time };
        return m.type === "DELTA" ? { time, value: v, color: deltaColor(v, m.opacity) } : { time, value: v };
      })
    );
  }

  // de baixo para cima (removeEmptyPanes conta os painéis que ainda existem)
  function remove() {
    removeFutures();
    removeLiquidations();
    removeMacdSeries();
    st.macdM = null;
    st.macdVals = null;
    removeRsiSeries();
    st.rsiM = null;
    st.rsiVals = null;
    removeCvdSeries();
    st.cvdM = null;
    st.cvdVals = null;
    removeVolumeSeries();
    st.points = null;
    removeEmptyPanes();
    hideTitles();
    toggleSettings(null, false);
  }

  // título do painel de liquidações: longs e shorts da vela idx (mira) ou da última, e a divisão por corretora
  function renderLiquidationTitle(idx) {
    const a = st.liqAligned;
    if (!st.liq) return;
    const tip = `<span class="help-tip" data-tip="${FUTURES_HELP.liq}">Liquidações</span>`;
    if (!a) {
      texts.liq.innerHTML = tip; // carregando
      return;
    }
    const n = a.long.length;
    const i = idx !== null && idx >= 0 && idx < n ? idx : n - 1;
    const long = a.long[i];
    const short = a.short[i];
    if (long == null && short == null) {
      texts.liq.innerHTML = `${tip} <span class="muted">sem dados nesta vela</span>`;
      return;
    }
    const by = Object.entries(a.by[i] || {})
      .filter(([, v]) => v.long + v.short > 0)
      .map(([name, v]) => `${name} ${formatUsdShort(v.long + v.short)}`)
      .join(" · ");
    texts.liq.innerHTML =
      `${tip} <span style="color:${COLORS.liqLong}">Longs <b>${formatUsdShort(long || 0)}</b></span>` +
      ` <span style="color:${COLORS.liqShort}">Shorts <b>${formatUsdShort(short || 0)}</b></span>` +
      (by ? ` <span class="muted">${by}</span>` : "");
  }

  // títulos com o valor na vela idx (mira) ou o mais recente
  function renderTitles(idx = null) {
    const tip = (key, label) => `<span class="help-tip" data-tip="${FUTURES_HELP[key]}">${label}</span>`;
    const pts = st.points;
    if (st.vol && pts?.length) {
      const i = idx !== null && idx >= 0 && idx < pts.length ? idx : pts.length - 1;
      const p = pts[i];
      const v = p.volume;
      const avgs = [...st.vmas.values()]
        .map(({ m, values }) => {
          const a = values?.[i];
          return `<span style="color:${maColor({ ...m, opacity: 1 })}">${maLabel(m)} ${a == null ? "--" : formatUsdShort(a)}</span>`;
        })
        .join(" ");
      texts.volume.innerHTML = `${tip("volume", "Volume")} <b class="${p.close >= p.open ? "pnl-pos" : "pnl-neg"}">${v == null ? "--" : formatUsdShort(v)}</b>${avgs ? ` ${avgs}` : ""}`;
    }
    if (st.cvd && st.cvdVals && pts?.length) {
      const i = idx !== null && idx >= 0 && idx < pts.length ? idx : pts.length - 1;
      const d = st.cvdVals.delta[i];
      const c = st.cvdVals.cvd[i];
      const cls = (v) => (v > 0 ? "pnl-pos" : v < 0 ? "pnl-neg" : "");
      // o nome do painel já é o valor principal; o outro vem depois, discreto
      const cvdHtml = `<b style="color:${maColor({ ...st.cvdM, opacity: 1 })}">${c === null ? "--" : signedUsd(c)}</b>`;
      const deltaHtml = `<b class="${cls(d)}">${d === null ? "--" : `${d > 0 ? "+" : ""}${signedUsd(d)}`}</b>`;
      texts.cvd.innerHTML =
        st.cvdM.type === "DELTA"
          ? `${tip("cvd", "Delta")} ${deltaHtml} <span class="muted">CVD</span> ${cvdHtml}`
          : `${tip("cvd", "CVD")} ${cvdHtml} <span class="muted">Delta da vela</span> ${deltaHtml}`;
    }
    if (st.rsi && st.rsiVals && pts?.length) {
      const i = idx !== null && idx >= 0 && idx < pts.length ? idx : pts.length - 1;
      const v = st.rsiVals[i];
      const m = st.rsiM;
      const zone =
        v === null ? "" : v >= m.overbought ? ' <span class="pnl-neg">sobrecomprado</span>' : v <= m.oversold ? ' <span class="pnl-pos">sobrevendido</span>' : "";
      const num = (x) => (x == null ? "--" : x.toFixed(1).replace(".", ","));
      const ma = st.rsiMa && st.rsiMaVals
        ? ` <span style="color:${m.maColor}">${m.maType} ${m.maPeriod} ${num(st.rsiMaVals[i])}</span>`
        : "";
      texts.rsi.innerHTML =
        `${tip("rsi", `RSI ${m.period}`)} <b style="color:${maColor({ ...m, opacity: 1 })}">${num(v)}</b>${ma}${zone}`;
    }
    if (st.macd && st.macdVals && pts?.length) {
      const i = idx !== null && idx >= 0 && idx < pts.length ? idx : pts.length - 1;
      const m = st.macdM;
      const { macd: line, signal, hist } = st.macdVals;
      const h = hist[i];
      texts.macd.innerHTML =
        `${tip("macd", `MACD ${m.fast} ${m.slow} ${m.signal}`)}` +
        ` <b style="color:${m.macdColor}">${macdNum(line[i])}</b>` +
        ` <span style="color:${m.signalColor}">Sinal ${macdNum(signal[i])}</span>` +
        (m.showHist ? ` <span class="muted">Hist.</span> <b class="${h > 0 ? "pnl-pos" : h < 0 ? "pnl-neg" : ""}">${macdNum(h)}</b>` : "");
    }
    renderLiquidationTitle(idx);
    const a = st.aligned;
    if (!a) {
      // carregando: só os nomes (sem os valores da moeda/vela anterior)
      if (st.series) {
        texts.oi.innerHTML = tip("oi", "Open interest");
        texts.ls.innerHTML = tip("ls", "Long/Short");
        texts.funding.innerHTML = tip("funding", "Funding");
      }
      return;
    }
    const at = (arr) => {
      if (idx !== null && idx >= 0 && idx < arr.length && arr[idx] !== null) return arr[idx];
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
      return null;
    };
    const oi = at(a.oi);
    const g = at(a.global);
    const t = at(a.top);
    const f = at(a.funding);
    const next = st.data.nextFunding;
    texts.oi.innerHTML = `${tip("oi", "Open interest")} <b>${oi === null ? "--" : formatUsdShort(oi)}</b>`;
    texts.ls.innerHTML = `${tip("ls", "Long/Short")} <span style="color:${COLORS.global}">Contas ${g === null ? "--" : pct(g / 100)}</span> <span style="color:${COLORS.top}">Top traders ${t === null ? "--" : pct(t / 100)}</span>`;
    texts.funding.innerHTML = `${tip("funding", "Funding")} <b class="${f > 0 ? "pnl-pos" : f < 0 ? "pnl-neg" : ""}">${f === null ? "--" : fundingPct(f / 100)}</b>${
      idx === null && next ? ` <span class="muted">· próxima ≈ ${fundingPct(next.r)}</span>` : ""
    }`;
  }

  function setVolumeData() {
    const { points, interval } = st;
    st.vol.setData(
      points.map((p) => {
        const time = toChartTime(p.time, interval);
        return p.volume == null ? { time } : { time, value: p.volume, color: p.close >= p.open ? COLORS.volumeUp : COLORS.volumeDown };
      })
    );
  }

  function setData() {
    const { data, points, interval } = st;
    const times = points.map((p) => toChartTime(p.time, interval));
    const line = (values) => times.map((time, i) => (values[i] === null ? { time } : { time, value: values[i] }));
    // funding: em velas diárias ou maiores, média das cobranças da vela; em velas menores, a taxa vigente
    const daily = !["1h", "4h"].includes(interval);
    st.aligned = {
      oi: alignToBars(points, data.oi, (r) => r.v, "last"),
      global: alignToBars(points, data.globalLS, (r) => r.l * 100, "last"),
      top: alignToBars(points, data.topLS, (r) => r.l * 100, "last"),
      funding: alignToBars(points, data.funding, (r) => r.r * 100, daily ? "avg" : "ffill"),
    };
    st.series.oi?.setData(line(st.aligned.oi));
    st.series.global?.setData(line(st.aligned.global));
    st.series.top?.setData(line(st.aligned.top));
    st.series.funding?.setData(
      times.map((time, i) => {
        const v = st.aligned.funding[i];
        return v === null ? { time } : { time, value: v, color: v >= 0 ? COLORS.fundingUp : COLORS.fundingDown };
      })
    );
  }

  return {
    /** margens do eixo do painel de índice paneIndex: as do RSI no painel dele; null = padrão da biblioteca */
    scaleMarginsOf(paneIndex) {
      return st.rsi && st.rsi.getPane().paneIndex() === paneIndex ? RSI_MARGINS : null;
    },
    /** points = velas (sem velas, remove tudo); data = resposta de /futures-data (available) ou null para
     *  remover só os painéis de futuros (o de volume fica); liq = resposta de /liquidations (available) ou
     *  null para remover o painel de liquidações; panes = painéis de futuros ligados (de FUTURES_PANES);
     *  volume = painel de volume ligado */
    update(points, interval, data, liq = null, panes = FUTURES_PANES, volume = true) {
      if (!points?.length) return remove();
      const keys = FUTURES_PANES.filter((k) => panes.includes(k));
      if (!keys.length) data = null;
      const candlesChanged = points !== st.points || interval !== st.interval;
      const liqSame = liq === st.liqData && !!liq === !!st.liq;
      const panesSame = keys.join() === st.shown.join();
      const volSame = volume === !!st.vol;
      if (st.points && !candlesChanged && volSame && data === st.data && !!data === !!st.series && liqSame && (!data || panesSame)) return;
      st.points = points;
      st.interval = interval;
      if (!volSame) rebuildTop({ ...topState(), volume });
      if (st.vol && (candlesChanged || !st.vol.data().length)) setVolumeData();
      if (data === PANE_LOADING) {
        // carregando: painéis no lugar, vazios (spinner em positionTitles)
        st.data = data;
        st.aligned = null;
        if (st.series && panesSame) for (const s of Object.values(st.series)) s.setData([]);
        else createSeries(keys);
      } else if (data) {
        if (!st.series || !panesSame) createSeries(keys);
        st.data = data;
        setData();
      } else removeFutures();
      if (liq === PANE_LOADING) {
        st.liqData = liq;
        st.liqAligned = null;
        if (st.liq) {
          st.liq.long.setData([]);
          st.liq.short.setData([]);
        } else withFuturesMoved(createLiquidationSeries);
      } else if (liq) {
        st.liqData = liq;
        alignLiquidations();
        if (st.liq) setLiquidationData();
        else withFuturesMoved(createLiquidationSeries);
      } else removeLiquidations();
      renderTitles();
      relayout();
    },
    // mira: valores da vela sob o mouse (null = mais recentes)
    crosshair(idx) {
      if (st.points) renderTitles(idx);
    },
    setVolumeAverages,
    setCvd,
    setRsi,
    setMacd,
    remove,
    active: () => !!st.series,
    /** quantos painéis existem abaixo do preço */
    count: subCount,
  };
}

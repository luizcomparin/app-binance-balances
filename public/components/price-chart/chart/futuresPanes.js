// Painéis abaixo do gráfico de preço (mesmo eixo de tempo: zoom, arrasto e mira sincronizados):
//   1. Volume (USDT, sempre que há velas)
//   2. Open interest (USDT)   3. Long/Short (% comprados: contas e top traders)   4. Taxa de funding
//   5. Liquidações reais (longs e shorts liquidados em US$; independente dos de futuros, sempre por último)
// Os de futuros vêm em períodos próprios (1h/4h/1d e funding a cada 8h) e são encaixados nas velas do gráfico.
import { formatUsdShort } from "../../../core/format.js";
import { toChartTime } from "./axis.js";
import { movingAverage, maColor, maLabel } from "./movingAverage.js";

const LWC = window.LightweightCharts;
const PANE_HEIGHT = 96;

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

export function createFuturesPanes(chart, wrap) {
  // vol = série de volume (painel 1); series = séries de futuros (um painel para cada item de shown, logo
  // depois do volume; só com dados de futuros); shown = painéis de futuros criados, na ordem do gráfico
  // vmas = médias do volume (id -> { series, key, values, m }), no painel de volume
  // liq = séries de liquidações reais ({ long, short }, último painel), liqData = resposta de /liquidations,
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
    points: null,
    interval: null,
  };

  // títulos dos painéis (HTML por cima do gráfico, com dica no hover): volume, OI, long/short, funding, liquidações
  const titles = {};
  for (const key of ["volume", "oi", "ls", "funding", "liq"]) {
    const el = document.createElement("div");
    el.className = "fp-title";
    el.hidden = true;
    wrap.appendChild(el);
    titles[key] = el;
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
    ...st.shown,
    ...(st.liq ? ["liq"] : []),
  ];
  // quantos painéis abaixo do preço devem existir
  const subCount = () => subKeys().length;

  // altura (px) de cada painel de baixo: PANE_HEIGHT até o usuário arrastar a divisória; daí fica a
  // escolhida (vale ao trocar de moeda, ligar/desligar futuros, redimensionar a janela e recarregar a página)
  const paneHeights = readPaneHeights();
  const heightOf = (key) => paneHeights[key] ?? PANE_HEIGHT;

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

  // painel de liquidações: sempre o último (logo depois do volume, ou depois dos de futuros). Quando os de
  // futuros entram ou saem, ele é recriado no lugar certo (withLiquidationsMoved)
  function createLiquidationSeries() {
    const pane = 2 + st.shown.length;
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

  // muda os painéis de futuros (fn) tirando antes o de liquidações e recolocando-o depois, por último
  function withLiquidationsMoved(fn) {
    const had = !!st.liq;
    removeLiquidationSeries();
    fn();
    if (had) createLiquidationSeries();
  }

  function removeLiquidations() {
    if (!st.liq && !st.liqData) return;
    removeLiquidationSeries();
    st.liqData = null;
    st.liqAligned = null;
    removeEmptyPanes();
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
    withLiquidationsMoved(() => {
      removeFuturesSeries();
      addFuturesSeries(keys);
    });
  }

  function addFuturesSeries(keys) {
    removeEmptyPanes(); // sobra de painéis que estavam depois do volume
    const percent = { type: "custom", minMove: 0.001, formatter: (v) => `${Math.round(v)}%` };
    const fundingFmt = { type: "custom", minMove: 0.000001, formatter: (v) => `${v.toFixed(3).replace(".", ",")}%` };
    st.series = {};
    keys.forEach((key, k) => {
      const pane = 2 + k;
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
    withLiquidationsMoved(() => {
      removeFuturesSeries();
      st.aligned = null;
      st.data = null;
    });
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

  function remove() {
    removeLiquidations();
    removeFutures();
    for (const id of [...st.vmas.keys()]) removeVolumeAverage(id);
    if (st.vol) chart.removeSeries(st.vol);
    st.vol = null;
    st.points = null;
    removeEmptyPanes();
    hideTitles();
  }

  // título do painel de liquidações: longs e shorts da vela idx (mira) ou da última, e a divisão por corretora
  function renderLiquidationTitle(idx) {
    const a = st.liqAligned;
    if (!st.liq) return;
    const tip = `<span class="help-tip" data-tip="${FUTURES_HELP.liq}">Liquidações</span>`;
    if (!a) {
      titles.liq.innerHTML = tip; // carregando
      return;
    }
    const n = a.long.length;
    const i = idx !== null && idx >= 0 && idx < n ? idx : n - 1;
    const long = a.long[i];
    const short = a.short[i];
    if (long == null && short == null) {
      titles.liq.innerHTML = `${tip} <span class="muted">sem dados nesta vela</span>`;
      return;
    }
    const by = Object.entries(a.by[i] || {})
      .filter(([, v]) => v.long + v.short > 0)
      .map(([name, v]) => `${name} ${formatUsdShort(v.long + v.short)}`)
      .join(" · ");
    titles.liq.innerHTML =
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
      titles.volume.innerHTML = `${tip("volume", "Volume")} <b class="${p.close >= p.open ? "pnl-pos" : "pnl-neg"}">${v == null ? "--" : formatUsdShort(v)}</b>${avgs ? ` ${avgs}` : ""}`;
    }
    renderLiquidationTitle(idx);
    const a = st.aligned;
    if (!a) {
      // carregando: só os nomes (sem os valores da moeda/vela anterior)
      if (st.series) {
        titles.oi.innerHTML = tip("oi", "Open interest");
        titles.ls.innerHTML = tip("ls", "Long/Short");
        titles.funding.innerHTML = tip("funding", "Funding");
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
    titles.oi.innerHTML = `${tip("oi", "Open interest")} <b>${oi === null ? "--" : formatUsdShort(oi)}</b>`;
    titles.ls.innerHTML = `${tip("ls", "Long/Short")} <span style="color:${COLORS.global}">Contas ${g === null ? "--" : pct(g / 100)}</span> <span style="color:${COLORS.top}">Top traders ${t === null ? "--" : pct(t / 100)}</span>`;
    titles.funding.innerHTML = `${tip("funding", "Funding")} <b class="${f > 0 ? "pnl-pos" : f < 0 ? "pnl-neg" : ""}">${f === null ? "--" : fundingPct(f / 100)}</b>${
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
    /** points = velas (sem velas, remove tudo); data = resposta de /futures-data (available) ou null para
     *  remover só os painéis de futuros (o de volume fica); liq = resposta de /liquidations (available) ou
     *  null para remover o painel de liquidações; panes = painéis de futuros ligados (de FUTURES_PANES) */
    update(points, interval, data, liq = null, panes = FUTURES_PANES) {
      if (!points?.length) return remove();
      const keys = FUTURES_PANES.filter((k) => panes.includes(k));
      if (!keys.length) data = null;
      const candlesChanged = points !== st.points || interval !== st.interval;
      const liqSame = liq === st.liqData && !!liq === !!st.liq;
      const panesSame = keys.join() === st.shown.join();
      if (st.vol && !candlesChanged && data === st.data && !!data === !!st.series && liqSame && (!data || panesSame)) return;
      if (!st.vol) createVolume();
      st.points = points;
      st.interval = interval;
      if (candlesChanged || !st.vol.data().length) setVolumeData();
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
        } else createLiquidationSeries();
      } else if (liq) {
        st.liqData = liq;
        alignLiquidations();
        if (st.liq) setLiquidationData();
        else createLiquidationSeries();
      } else removeLiquidations();
      renderTitles();
      relayout();
    },
    // mira: valores da vela sob o mouse (null = mais recentes)
    crosshair(idx) {
      if (st.vol) renderTitles(idx);
    },
    setVolumeAverages,
    remove,
    active: () => !!st.series,
    /** quantos painéis existem abaixo do preço */
    count: subCount,
  };
}

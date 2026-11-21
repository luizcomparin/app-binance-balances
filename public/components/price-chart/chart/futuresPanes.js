// Painéis abaixo do gráfico de preço (mesmo eixo de tempo: zoom, arrasto e mira sincronizados):
//   1. Volume (USDT, sempre que há velas)
//   2. Open interest (USDT)   3. Long/Short (% comprados: contas e top traders)   4. Taxa de funding
// Os de futuros vêm em períodos próprios (1h/4h/1d e funding a cada 8h) e são encaixados nas velas do gráfico.
import { formatUsdShort } from "./liquidationOverlay.js";
import { toChartTime } from "./axis.js";

const LWC = window.LightweightCharts;
const PANE_HEIGHT = 96;

const COLORS = {
  volumeUp: "rgba(82, 255, 168, 0.5)",
  volumeDown: "rgba(255, 114, 114, 0.5)",
  oi: "#a78bfa",
  global: "#ffd166",
  top: "#4dd4ff",
  fundingUp: "rgba(82, 255, 168, 0.8)",
  fundingDown: "rgba(255, 114, 114, 0.8)",
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
  if (mode === "ffill") {
    let last = null;
    return values.map((v) => (v === null ? last : (last = v)));
  }
  return values;
}

export function createFuturesPanes(chart, wrap) {
  // vol = série de volume (painel 1); series = séries de futuros (painéis 2 a 4, só com dados de futuros)
  const st = { vol: null, series: null, aligned: null, data: null, points: null, interval: null };

  // títulos dos painéis (HTML por cima do gráfico, com dica no hover): volume, OI, long/short, funding
  const titles = [1, 2, 3, 4].map(() => {
    const el = document.createElement("div");
    el.className = "fp-title";
    el.hidden = true;
    wrap.appendChild(el);
    return el;
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
    titles.forEach((el, k) => {
      const pane = panes[k + 1];
      const active = k === 0 ? st.vol : st.series;
      const paneEl = active && pane ? pane.getHTMLElement() : null;
      el.hidden = !paneEl;
      if (paneEl) el.style.top = `${paneEl.getBoundingClientRect().top - wrapTop + 4}px`;
    });
  }
  // quantos painéis abaixo do preço devem existir (volume + 3 de futuros)
  const subCount = () => (st.vol ? 1 : 0) + (st.series ? 3 : 0);

  // painéis de baixo em uso, na ordem do gráfico
  const subKeys = () => [...(st.vol ? ["volume"] : []), ...(st.series ? ["oi", "ls", "funding"] : [])];

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

  function createSeries() {
    const percent = { type: "custom", minMove: 0.001, formatter: (v) => `${Math.round(v)}%` };
    const fundingFmt = { type: "custom", minMove: 0.000001, formatter: (v) => `${v.toFixed(3).replace(".", ",")}%` };
    st.series = {
      oi: chart.addSeries(
        LWC.AreaSeries,
        { ...base, lineColor: COLORS.oi, topColor: "rgba(167, 139, 250, 0.25)", bottomColor: "rgba(167, 139, 250, 0.02)", lineWidth: 2, priceFormat: usd },
        2
      ),
      global: chart.addSeries(LWC.LineSeries, { ...base, color: COLORS.global, lineWidth: 2, priceFormat: percent }, 3),
      top: chart.addSeries(LWC.LineSeries, { ...base, color: COLORS.top, lineWidth: 2, priceFormat: percent }, 3),
      funding: chart.addSeries(LWC.HistogramSeries, { ...base, priceFormat: fundingFmt, base: 0 }, 4),
    };
    st.series.global.createPriceLine({ price: 50, color: "rgba(155, 176, 214, 0.4)", lineWidth: 1, lineStyle: LWC.LineStyle.Dashed, axisLabelVisible: false });
    relayout(); // alturas depois do layout (o gráfico acabou de crescer para caber os painéis)
  }

  // painéis vazios que sobrarem depois dos que estão em uso
  function removeEmptyPanes() {
    for (let i = chart.panes().length - 1; i > subCount(); i--) chart.removePane(i);
  }

  function removeFutures() {
    if (!st.series) return;
    for (const s of Object.values(st.series)) chart.removeSeries(s);
    st.series = null;
    st.aligned = null;
    st.data = null;
    removeEmptyPanes();
    titles.slice(1).forEach((el) => (el.hidden = true));
  }

  function remove() {
    removeFutures();
    if (st.vol) chart.removeSeries(st.vol);
    st.vol = null;
    st.points = null;
    removeEmptyPanes();
    titles.forEach((el) => (el.hidden = true));
  }

  // títulos com o valor na vela idx (mira) ou o mais recente
  function renderTitles(idx = null) {
    const tip = (key, label) => `<span class="help-tip" data-tip="${FUTURES_HELP[key]}">${label}</span>`;
    const pts = st.points;
    if (st.vol && pts?.length) {
      const p = idx !== null && idx >= 0 && idx < pts.length ? pts[idx] : pts.at(-1);
      const v = p.volume;
      titles[0].innerHTML = `${tip("volume", "Volume")} <b class="${p.close >= p.open ? "pnl-pos" : "pnl-neg"}">${v == null ? "--" : formatUsdShort(v)}</b>`;
    }
    const a = st.aligned;
    if (!a) return;
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
    titles[1].innerHTML = `${tip("oi", "Open interest")} <b>${oi === null ? "--" : formatUsdShort(oi)}</b>`;
    titles[2].innerHTML = `${tip("ls", "Long/Short")} <span style="color:${COLORS.global}">Contas ${g === null ? "--" : pct(g / 100)}</span> <span style="color:${COLORS.top}">Top traders ${t === null ? "--" : pct(t / 100)}</span>`;
    titles[3].innerHTML = `${tip("funding", "Funding")} <b class="${f > 0 ? "pnl-pos" : f < 0 ? "pnl-neg" : ""}">${f === null ? "--" : fundingPct(f / 100)}</b>${
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
    st.series.oi.setData(line(st.aligned.oi));
    st.series.global.setData(line(st.aligned.global));
    st.series.top.setData(line(st.aligned.top));
    st.series.funding.setData(
      times.map((time, i) => {
        const v = st.aligned.funding[i];
        return v === null ? { time } : { time, value: v, color: v >= 0 ? COLORS.fundingUp : COLORS.fundingDown };
      })
    );
  }

  return {
    /** points = velas (sem velas, remove tudo); data = resposta de /futures-data (available) ou null para
     *  remover só os painéis de futuros (o de volume fica) */
    update(points, interval, data) {
      if (!points?.length) return remove();
      const candlesChanged = points !== st.points || interval !== st.interval;
      if (st.vol && !candlesChanged && data === st.data && !!data === !!st.series) return;
      if (!st.vol) createVolume();
      st.points = points;
      st.interval = interval;
      if (candlesChanged || !st.vol.data().length) setVolumeData();
      if (data) {
        if (!st.series) createSeries();
        st.data = data;
        setData();
      } else removeFutures();
      renderTitles();
      relayout();
    },
    // mira: valores da vela sob o mouse (null = mais recentes)
    crosshair(idx) {
      if (st.vol) renderTitles(idx);
    },
    remove,
    active: () => !!st.series,
    /** quantos painéis existem abaixo do preço */
    count: subCount,
  };
}

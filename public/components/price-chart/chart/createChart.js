// Gráfico de preço com TradingView Lightweight Charts: linha ou velas, zoom/arrasto, janela de tempo
// e histórico sob demanda. Sobreposições, legenda e tooltip ficam nos módulos vizinhos.
import { isSimEnabled, simBox } from "../buySimulator.js";
import { formatAxisPrice, formatChartTime, fromChartTime, INTRADAY, priceFormatFor, toChartTime } from "./axis.js";
import {
  buildMarkers,
  COLORS,
  drawPriceLines,
  markerSizeScale,
  offscreenSummary,
  visibleMyOrders,
} from "./overlays.js";
import { createLegend } from "./legend.js";
import { candleTooltipHtml, createTooltip, ordersTooltipHtml, simTooltipHtml } from "./tooltip.js";

const LWC = window.LightweightCharts;

/**
 * Cria o gráfico uma única vez; depois é só chamar update(opts) a cada mudança.
 * els = { container, wrap, legend }   handlers = { onNeedOlder }
 *
 * update(opts): opts = { asset, points, interval, mode, avg, orders: { buys, sells },
 *                        openOrders: { buys, sells } | null, projectedAvg, window, prepended }
 *   window: { fromMs, toMs } → mostra essa janela de tempo (novo período/moeda/vela); null → tudo
 *   prepended: n → n velas antigas foram adicionadas no início (mantém a posição da tela)
 */
export function createPriceChart(els, handlers = {}) {
  const { container, wrap } = els;

  const s = {
    series: null,
    mode: null,
    markersApi: null,
    priceLines: [],
    points: null,
    interval: null,
    timeIndex: new Map(),
    precision: 4, // casas decimais do eixo (definidas pela grandeza do preço)
    timeVisible: null, // eixo de tempo mostrando horas (velas intradiárias)
    opts: null,
    hidden: { myBuys: false, mySells: false, openBuys: false, openSells: false },
  };

  const chart = LWC.createChart(container, {
    autoSize: true,
    layout: {
      background: { type: LWC.ColorType.Solid, color: "transparent" },
      textColor: "#9bb0d6",
      fontFamily: "Manrope, sans-serif",
      fontSize: 11,
      attributionLogo: true,
    },
    grid: {
      vertLines: { color: "rgba(255, 255, 255, 0.04)" },
      horzLines: { color: "rgba(255, 255, 255, 0.05)" },
    },
    // mira livre (não gruda no fechamento): o simulador precisa do preço exato sob o mouse
    crosshair: { mode: LWC.CrosshairMode.Normal },
    rightPriceScale: { borderColor: "rgba(255, 255, 255, 0.08)" },
    timeScale: { borderColor: "rgba(255, 255, 255, 0.08)", rightOffset: 4 },
    localization: {
      locale: "pt-BR",
      priceFormatter: (p) => formatAxisPrice(p, s.precision),
      timeFormatter: (t) => formatChartTime(t, INTRADAY.has(s.interval)),
    },
  });

  const tooltip = createTooltip(wrap, container);

  // resumo das ordens abertas fora da faixa de preço visível
  const offTop = document.createElement("div");
  offTop.className = "lwc-offscreen top";
  const offBottom = document.createElement("div");
  offBottom.className = "lwc-offscreen bottom";
  wrap.append(offTop, offBottom);

  const renderLegend = createLegend(els.legend, {
    onToggle(key) {
      if (!s.opts) return;
      s.hidden[key] = !s.hidden[key];
      drawOverlays();
      updateOffscreen();
    },
    onFit() {
      lastFrom = null;
      chart.timeScale().fitContent();
      chart.priceScale("right").applyOptions({ autoScale: true });
    },
  });

  // ---------------------------------------------------------------------------
  // séries e dados
  // ---------------------------------------------------------------------------

  // o eixo inclui o preço médio (e o projetado), mas não as ordens abertas
  const autoscaleInfoProvider = (original) => {
    const res = original();
    if (!res?.priceRange) return res;
    for (const v of [s.opts?.avg, s.opts?.projectedAvg]) {
      if (v === null || v === undefined) continue;
      res.priceRange.minValue = Math.min(res.priceRange.minValue, v);
      res.priceRange.maxValue = Math.max(res.priceRange.maxValue, v);
    }
    return res;
  };

  function ensureSeries(mode) {
    if (s.series && s.mode === mode) return false;
    if (s.series) chart.removeSeries(s.series);

    s.series =
      mode === "candle"
        ? chart.addSeries(LWC.CandlestickSeries, {
            upColor: COLORS.up,
            downColor: COLORS.down,
            wickUpColor: COLORS.up,
            wickDownColor: COLORS.down,
            borderVisible: false,
            autoscaleInfoProvider,
          })
        : chart.addSeries(LWC.AreaSeries, {
            lineColor: COLORS.line,
            topColor: "rgba(77, 212, 255, 0.25)",
            bottomColor: "rgba(77, 212, 255, 0.02)",
            lineWidth: 2,
            autoscaleInfoProvider,
          });
    s.markersApi = LWC.createSeriesMarkers(s.series, []);
    s.priceLines = [];
    s.mode = mode;
    return true;
  }

  // Mostra a janela [fromMs, toMs] (toMs null = até a última vela); fromMs <= início dos dados = tudo
  function showWindow(win) {
    const first = s.points?.[0]?.time;
    const last = s.points?.at(-1)?.time;
    if (first === undefined) return;
    lastFrom = null; // enquadrar não é arrastar
    if (!win || win.fromMs <= first) {
      if (!win?.toMs || win.toMs >= last) {
        chart.timeScale().fitContent();
        return;
      }
    }
    const from = Math.max(win.fromMs, first);
    const to = win.toMs ? Math.min(win.toMs, last) : last;
    const range = { from: toChartTime(from, s.interval), to: toChartTime(to, s.interval) };
    const points = s.points;
    chart.timeScale().setVisibleRange(range);
    // a biblioteca pode reajustar o espaçamento das velas no quadro seguinte (ex.: ao trocar
    // o tamanho da vela) e desfazer a janela; reaplica uma vez se os dados ainda forem os mesmos
    requestAnimationFrame(() => {
      if (s.points !== points) return;
      lastFrom = null;
      chart.timeScale().setVisibleRange(range);
    });
  }

  function setSeriesData(prepended, win) {
    const range = prepended ? chart.timeScale().getVisibleLogicalRange() : null;
    s.timeIndex = new Map();
    const candle = s.mode === "candle";
    const data = s.points.map((p, i) => {
      const time = toChartTime(p.time, s.interval);
      s.timeIndex.set(time, i);
      return candle ? { time, open: p.open, high: p.high, low: p.low, close: p.close } : { time, value: p.close };
    });
    const priceFormat = priceFormatFor(s.points.at(-1)?.close);
    s.precision = priceFormat.precision;
    s.series.applyOptions({ priceFormat });
    s.series.setData(data);

    if (range) {
      lastFrom = null; // o deslocamento abaixo não é um arrasto
      chart.timeScale().setVisibleLogicalRange({ from: range.from + prepended, to: range.to + prepended });
    } else if (win !== undefined) {
      showWindow(win);
    }
  }

  // linhas de preço, marcadores e legenda (tudo que depende de opts/hidden)
  function drawOverlays() {
    s.priceLines = drawPriceLines(s.series, s.priceLines, s.opts, s.hidden);
    s.sizeOf = markerSizeScale(s.opts.orders);
    s.markersApi.setMarkers(buildMarkers(visibleMyOrders(s.opts.orders, s.hidden), s.points, s.interval, s.sizeOf));
    renderLegend(s.opts, s.hidden);
  }

  // ---------------------------------------------------------------------------
  // ordens abertas fora da área visível
  // ---------------------------------------------------------------------------

  function updateOffscreen() {
    const oo = s.opts?.openOrders;
    const height = s.series ? chart.paneSize(0)?.height : 0;
    if (!oo || !height) {
      offTop.hidden = offBottom.hidden = true;
      return;
    }
    const { above, below } = offscreenSummary(
      oo,
      s.hidden,
      s.series.coordinateToPrice(0),
      s.series.coordinateToPrice(height)
    );
    offTop.textContent = above;
    offBottom.textContent = below;
    offTop.hidden = !above;
    offBottom.hidden = !below;
  }

  let offscreenFrame = 0;
  const scheduleOffscreen = () => {
    cancelAnimationFrame(offscreenFrame);
    offscreenFrame = requestAnimationFrame(updateOffscreen);
  };

  // ---------------------------------------------------------------------------
  // histórico sob demanda
  // ---------------------------------------------------------------------------

  // Perto do começo dos dados, indo para trás *e* com o usuário mexendo no gráfico: pede mais histórico.
  // (enquadrar/ajustar também leva a visão ao início dos dados, mas isso não é arrastar)
  let lastFrom = null;
  let lastInteraction = 0;
  for (const type of ["pointerdown", "pointermove", "mousedown", "mousemove", "wheel", "touchmove"]) {
    container.addEventListener(
      type,
      (e) => {
        const isMove = type === "pointermove" || type === "mousemove";
        if (!isMove || e.buttons) lastInteraction = performance.now();
      },
      { capture: true, passive: true }
    );
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    scheduleOffscreen();
    if (!range) return;
    const goingBack = lastFrom !== null && range.from < lastFrom - 0.01;
    lastFrom = range.from;
    const userMoving = performance.now() - lastInteraction < 1000;
    if (goingBack && userMoving && range.from < 10) handlers.onNeedOlder?.();
  });

  // ---------------------------------------------------------------------------
  // tooltip e simulador
  // ---------------------------------------------------------------------------

  chart.subscribeCrosshairMove((param) => {
    scheduleOffscreen();
    if (!s.series || !s.points || !param.point || param.time === undefined) return tooltip.hide();

    if (isSimEnabled()) {
      const price = s.series.coordinateToPrice(param.point.y);
      if (price === null) return tooltip.hide();
      const box = simBox(price);
      return tooltip.show(param.point, simTooltipHtml(box), `sim ${box.status}`);
    }

    const idx = s.timeIndex.get(param.time);
    if (idx === undefined) return tooltip.hide();
    const currentPrice = s.points.at(-1)?.close ?? null;
    const atCandle = visibleMyOrders(s.opts.orders, s.hidden).filter((m) => m.idx === idx);

    // mouse em cima de um marcador → detalhes da(s) ordem(ns); bolinhas maiores têm área maior
    const hovered = atCandle.filter((m) => {
      const y = s.series.priceToCoordinate(m.y);
      return y !== null && Math.abs(y - param.point.y) <= 4 + 4 * (s.sizeOf?.(m) ?? 1);
    });
    if (hovered.length) return tooltip.show(param.point, ordersTooltipHtml(hovered, currentPrice));

    // senão → a vela sob o mouse
    const title = formatChartTime(param.time, INTRADAY.has(s.interval));
    tooltip.show(param.point, candleTooltipHtml(title, s.points[idx], s.mode === "candle", atCandle));
  });

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  return {
    update(opts) {
      s.opts = opts;
      const recreated = ensureSeries(opts.mode);
      const dataChanged = recreated || opts.points !== s.points;
      s.points = opts.points;
      s.interval = opts.interval;
      // só mexe nas opções do eixo de tempo quando mudam (mudar provoca reajuste de layout)
      const timeVisible = INTRADAY.has(opts.interval);
      if (timeVisible !== s.timeVisible) {
        s.timeVisible = timeVisible;
        chart.applyOptions({ timeScale: { timeVisible, secondsVisible: false } });
      }

      if (dataChanged) setSeriesData(opts.prepended || 0, opts.window);
      else if (opts.window !== undefined) showWindow(opts.window);

      drawOverlays();
      scheduleOffscreen();
    },

    // janela de tempo visível agora: { fromMs, toMs } (toMs null = encostado na última vela)
    getVisibleWindow() {
      const r = chart.timeScale().getVisibleRange();
      if (!r || !s.points?.length) return null;
      const fromMs = fromChartTime(r.from, s.interval);
      const toMs = fromChartTime(r.to, s.interval);
      return { fromMs, toMs: toMs >= s.points.at(-1).time ? null : toMs };
    },

    // limpa ao trocar de moeda (sem destruir o gráfico)
    clear() {
      if (s.series) {
        for (const line of s.priceLines) s.series.removePriceLine(line);
        s.priceLines = [];
        s.markersApi?.setMarkers([]);
        s.series.setData([]);
      }
      s.points = null;
      s.opts = null;
      if (els.legend) els.legend.innerHTML = "";
      offTop.hidden = offBottom.hidden = true;
      tooltip.hide();
    },
  };
}

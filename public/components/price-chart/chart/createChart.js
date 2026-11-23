// Gráfico de preço com TradingView Lightweight Charts: linha ou velas, zoom/arrasto, janela de tempo
// e histórico sob demanda. Sobreposições, legenda e tooltip ficam nos módulos vizinhos.
import { isSimEnabled, simBox } from "../buySimulator.js";
import { formatAxisPrice, formatChartTime, fromChartTime, INTRADAY, priceFormatFor, toChartTime } from "./axis.js";
import {
  AVG_HELP,
  buildMarkers,
  COLORS,
  drawPriceLines,
  markerSizeScale,
  offscreenSummary,
  visibleMyOrders,
} from "./overlays.js";
import { createLegend } from "./legend.js";
import { maColor, maLabel, movingAverage } from "./movingAverage.js";
import { BandFill, bollinger } from "./bollinger.js";
import { LiquidationOverlay } from "./liquidationOverlay.js";
import { createFuturesPanes } from "./futuresPanes.js";
import { createMeasureTool } from "./measureTool.js";
import { createDrawings } from "./drawings.js";
import { createDrawingToolbar } from "./drawingToolbar.js";
import { candleTooltipHtml, createTooltip, lineHelpTooltipHtml, ordersTooltipHtml, simTooltipHtml } from "./tooltip.js";

const LWC = window.LightweightCharts;

/**
 * Cria o gráfico uma única vez; depois é só chamar update(opts) a cada mudança.
 * els = { container, wrap, legend }   handlers = { onNeedOlder }
 *
 * update(opts): opts = { asset, points, interval, mode, avg, orders: { buys, sells },
 *                        openOrders: { buys, sells } | null, projectedAvg, fixedAvg, dcaAvg, window, prepended,
 *                        indicators: [{ id, kind: "ma"|"bb"|"vma", period, type?, mult?, color, opacity, visible }],
 *                        ("vma" = média do volume, desenhada no painel de volume)
 *                        liquidation: resposta de /liquidation-map | null,
 *                        futures: resposta de /futures-data | null (painéis de OI, long/short e funding),
 *                        liquidations: resposta de /liquidations | null (painel de liquidações reais) }
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
    priceFormat: null, // formato do eixo (as médias móveis usam o mesmo)
    inds: new Map(), // indicadores: id -> { series: [...], fill?, points, key, times, values }
  };

  const chart = LWC.createChart(container, {
    autoSize: true,
    layout: {
      background: { type: LWC.ColorType.Solid, color: "transparent" },
      textColor: "#9bb0d6",
      fontFamily: "Manrope, sans-serif",
      fontSize: 11,
      attributionLogo: true,
      // painéis de futuros abaixo do preço
      panes: { separatorColor: "rgba(255, 255, 255, 0.08)", separatorHoverColor: "rgba(77, 212, 255, 0.25)", enableResize: true },
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
      timeFormatter: (t) => formatChartTime(t, INTRADAY.has(s.interval)),
    },
  });

  const tooltip = createTooltip(wrap, container);

  // mapa de liquidação estimado (anexado à série principal; reanexado quando ela é recriada)
  const liquidation = new LiquidationOverlay(timeToX);

  // painéis de volume, open interest, long/short e funding (mesmo eixo de tempo)
  const futures = createFuturesPanes(chart, wrap);

  // ferramentas de desenho (linha de tendência, raio, horizontal, retângulo, canal) e a barra delas;
  // criadas antes da régua: nos cliques, a régua em andamento tem prioridade
  const toolbar = createDrawingToolbar(wrap, (tool) => drawings.setTool(tool), () => drawings.setVisible(!drawings.isVisible()));
  const drawings = createDrawings(chart, {
    container,
    getSeries: () => s.series,
    getPoints: () => s.points,
    getInterval: () => s.interval,
    isBusy: () => measure.busy(),
    onToolChange: (tool) => toolbar.setActive(tool),
    onVisibleChange: (visible) => toolbar.setVisible(visible),
  });
  toolbar.setVisible(drawings.isVisible());

  // régua de medição (Shift + clique); anexada à série principal, como o mapa de liquidação
  const measure = createMeasureTool(chart, {
    getSeries: () => s.series,
    getPoints: () => s.points,
    getInterval: () => s.interval,
  });

  // resumo das ordens abertas fora da faixa de preço visível
  const offTop = document.createElement("div");
  offTop.className = "lwc-offscreen top";
  const offBottom = document.createElement("div");
  offBottom.className = "lwc-offscreen bottom";
  // canto superior esquerdo: "↑ 7 vendas acima" + resumo do que está na tela (par · vela · período)
  const summary = document.createElement("div");
  summary.className = "lwc-offscreen summary";
  summary.hidden = true;
  const topBar = document.createElement("div");
  topBar.className = "lwc-topbar";
  topBar.append(offTop, summary);
  // legenda (linhas de preço médio, ordens...) na mesma barra, logo depois do resumo
  if (els.legend) topBar.append(els.legend);
  wrap.append(topBar, offBottom);

  const renderLegend = createLegend(els.legend, {
    onToggle(key) {
      if (!s.opts) return;
      s.hidden[key] = !s.hidden[key];
      drawOverlays();
      updateOffscreen();
    },
    onFit: fit,
  });

  // enquadra todo o período carregado e volta a escala de preço para automática
  function fit() {
    lastFrom = null;
    chart.timeScale().fitContent();
    chart.priceScale("right").applyOptions({ autoScale: true });
  }

  // ---------------------------------------------------------------------------
  // séries e dados
  // ---------------------------------------------------------------------------

  // o eixo inclui o preço médio (e o projetado), mas não as ordens abertas
  const autoscaleInfoProvider = (original) => {
    const res = original();
    if (!res?.priceRange) return res;
    for (const v of [s.opts?.avg, s.opts?.avgSell, s.opts?.projectedAvg, s.opts?.projectedSellAvg, s.opts?.fixedAvg, s.opts?.dcaAvg]) {
      if (v === null || v === undefined) continue;
      res.priceRange.minValue = Math.min(res.priceRange.minValue, v);
      res.priceRange.maxValue = Math.max(res.priceRange.maxValue, v);
    }
    return res;
  };

  function ensureSeries(mode) {
    if (s.series && s.mode === mode) return false;
    // a série antiga só sai depois que a nova existe: se o painel de preço ficasse vazio, a biblioteca
    // o removeria e os painéis de futuros subiriam de posição
    const old = s.series;
    removeIndicators(); // recriados depois, para ficarem por cima da nova série

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
    if (old) {
      old.detachPrimitive(liquidation);
      old.detachPrimitive(measure.primitive);
      old.detachPrimitive(drawings.primitive);
      chart.removeSeries(old);
    }
    s.markersApi = LWC.createSeriesMarkers(s.series, []);
    s.series.attachPrimitive(liquidation);
    s.series.attachPrimitive(measure.primitive);
    s.series.attachPrimitive(drawings.primitive);
    s.priceLines = [];
    s.mode = mode;
    return true;
  }

  // Instante (ms) → x no eixo de tempo, interpolando dentro da vela (o mapa de liquidação é por hora,
  // mas o gráfico pode estar em velas diárias). Antes da primeira vela → null.
  function timeToX(ms) {
    const pts = s.points;
    if (!pts?.length || ms < pts[0].time) return null;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].time <= ms) lo = mid;
      else hi = mid - 1;
    }
    const step = lo + 1 < pts.length ? pts[lo + 1].time - pts[lo].time : lo > 0 ? pts[lo].time - pts[lo - 1].time : 1;
    const frac = Math.min(1, Math.max(0, (ms - pts[lo].time) / step));
    // logicalToCoordinate só aceita índices inteiros (com fração devolve null): interpola entre velas
    const ts = chart.timeScale();
    const x = ts.logicalToCoordinate(lo);
    if (x === null) return null;
    const next = ts.logicalToCoordinate(lo + 1);
    const prev = lo > 0 ? ts.logicalToCoordinate(lo - 1) : null;
    const spacing = next !== null ? next - x : prev !== null ? x - prev : 0;
    return x + (frac - 0.5) * spacing;
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
    // formato por série (e não global): os painéis de futuros têm formatos próprios (B/M, %, funding)
    const base = priceFormatFor(s.points.at(-1)?.close);
    const priceFormat = { type: "custom", minMove: base.minMove, precision: base.precision, formatter: (p) => formatAxisPrice(p, base.precision) };
    s.precision = base.precision;
    s.priceFormat = priceFormat;
    s.series.applyOptions({ priceFormat });
    s.series.setData(data);

    if (range) {
      lastFrom = null; // o deslocamento abaixo não é um arrasto
      chart.timeScale().setVisibleLogicalRange({ from: range.from + prepended, to: range.to + prepended });
    } else if (win !== undefined) {
      showWindow(win);
    }
  }

  // ---------------------------------------------------------------------------
  // indicadores: média móvel = 1 linha; Bollinger = 3 linhas (superior, média, inferior) + preenchimento
  // ---------------------------------------------------------------------------

  const lineOptions = { lineWidth: 2, priceLineVisible: false, crosshairMarkerVisible: false };

  function removeIndicator(ind) {
    if (ind.fill) ind.series[0].detachPrimitive(ind.fill);
    for (const series of ind.series) chart.removeSeries(series);
  }

  function removeIndicators() {
    for (const ind of s.inds.values()) removeIndicator(ind);
    s.inds.clear();
  }

  function createIndicator(m) {
    if (m.kind === "bb") {
      const ind = {
        series: [
          chart.addSeries(LWC.LineSeries, { ...lineOptions, lineWidth: 1, lineStyle: LWC.LineStyle.Dashed }), // média
          chart.addSeries(LWC.LineSeries, { ...lineOptions, lineWidth: 1 }), // superior
          chart.addSeries(LWC.LineSeries, { ...lineOptions, lineWidth: 1 }), // inferior
        ],
        fill: new BandFill(),
      };
      ind.series[0].attachPrimitive(ind.fill);
      return ind;
    }
    return { series: [chart.addSeries(LWC.LineSeries, lineOptions)] };
  }

  // linha com ponto vazio onde ainda não há valor (aquecimento), para manter o alinhamento com as velas
  function lineData(times, values) {
    return times.map((time, i) => (values[i] === null ? { time } : { time, value: values[i] }));
  }

  function drawIndicators() {
    // médias do volume ficam no painel de volume (futuresPanes)
    const visible = (s.opts.indicators || []).filter((m) => m.visible && m.kind !== "vma");
    const ids = new Set(visible.map((m) => m.id));
    for (const [id, ind] of s.inds) {
      if (ids.has(id)) continue;
      removeIndicator(ind);
      s.inds.delete(id);
    }
    const priceFormat = s.priceFormat ? { priceFormat: s.priceFormat } : {};
    for (const m of visible) {
      let ind = s.inds.get(m.id);
      if (!ind) {
        ind = createIndicator(m);
        s.inds.set(m.id, ind);
      }
      const color = maColor(m);
      if (m.kind === "bb") {
        const [basis, upper, lower] = ind.series;
        basis.applyOptions({ color, title: `BB ${m.period} ${String(m.mult).replace(".", ",")}`, ...priceFormat });
        upper.applyOptions({ color, ...priceFormat });
        lower.applyOptions({ color, ...priceFormat });
      } else {
        ind.series[0].applyOptions({ color, title: maLabel(m), ...priceFormat });
      }

      // recalcula só quando mudam as velas ou os parâmetros; a cor do preenchimento muda sempre
      const key = m.kind === "bb" ? `bb|${m.period}|${m.mult}|${s.interval}` : `${m.type}|${m.period}|${s.interval}`;
      const fillColor = maColor({ color: m.color, opacity: m.opacity * 0.12 });
      if (ind.points === s.points && ind.key === key) {
        if (ind.fill && ind.fillColor !== fillColor) {
          ind.fillColor = fillColor;
          ind.fill.setData(ind.times, ind.values.upper, ind.values.lower, fillColor);
        }
        continue;
      }
      ind.points = s.points;
      ind.key = key;
      ind.times = s.points.map((p) => toChartTime(p.time, s.interval));
      if (m.kind === "bb") {
        ind.values = bollinger(s.points, m.period, m.mult);
        ind.series[0].setData(lineData(ind.times, ind.values.basis));
        ind.series[1].setData(lineData(ind.times, ind.values.upper));
        ind.series[2].setData(lineData(ind.times, ind.values.lower));
        ind.fillColor = fillColor;
        ind.fill.setData(ind.times, ind.values.upper, ind.values.lower, fillColor);
      } else {
        ind.values = movingAverage(s.points, m.period, m.type);
        ind.series[0].setData(lineData(ind.times, ind.values));
      }
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
    // embaixo do painel de preço (com os painéis de futuros, o fim do gráfico fica mais abaixo)
    offBottom.style.top = `${height - 24}px`;
    offBottom.style.bottom = "auto";
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

  // Etiqueta de preço médio (dinâmico de compra/venda ou fixo) sob o mouse? (desenhada no canto direito da área)
  function lineLabelAt(point) {
    const width = chart.paneSize(0)?.width;
    if (!width) return null;
    for (const key of ["avg", "avgSell", "fixedAvg"]) {
      const price = s.opts?.[key];
      if (!price) continue;
      const y = s.series.priceToCoordinate(price);
      const labelWidth = AVG_HELP[key].title.length * 7 + 16; // ≈ largura do texto da etiqueta
      if (y !== null && Math.abs(y - point.y) <= 9 && point.x >= width - labelWidth) return AVG_HELP[key];
    }
    return null;
  }

  chart.subscribeCrosshairMove((param) => {
    scheduleOffscreen();
    futures.crosshair(param.point && param.logical !== undefined ? Math.round(param.logical) : null);
    // medindo ou desenhando: o ponto seguinte segue o mouse (sem tooltip da vela)
    if (measure.move(param) || drawings.move(param)) return tooltip.hide();
    if (!s.series || !s.points || !param.point || param.time === undefined) return tooltip.hide();
    if (param.paneIndex) return tooltip.hide(); // mouse nos painéis de futuros: só os títulos mostram os valores

    if (isSimEnabled()) {
      const price = s.series.coordinateToPrice(param.point.y);
      if (price === null) return tooltip.hide();
      const box = simBox(price);
      return tooltip.show(param.point, simTooltipHtml(box), `sim ${box.status}`);
    }

    // mouse na etiqueta (lado direito) de uma linha de preço médio → explicação dela
    const help = lineLabelAt(param.point);
    if (help) return tooltip.show(param.point, lineHelpTooltipHtml(help), "help");

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
    fit,

    update(opts) {
      s.opts = opts;
      const recreated = ensureSeries(opts.mode);
      const dataChanged = recreated || opts.points !== s.points;
      s.points = opts.points;
      if (s.interval && opts.interval !== s.interval) measure.clear(); // outra vela: a medida não vale mais
      s.interval = opts.interval;
      drawings.setAsset(opts.asset);
      // só mexe nas opções do eixo de tempo quando mudam (mudar provoca reajuste de layout)
      const timeVisible = INTRADAY.has(opts.interval);
      if (timeVisible !== s.timeVisible) {
        s.timeVisible = timeVisible;
        chart.applyOptions({ timeScale: { timeVisible, secondsVisible: false } });
      }

      if (dataChanged) setSeriesData(opts.prepended || 0, opts.window);
      else if (opts.window !== undefined) showWindow(opts.window);

      drawOverlays();
      drawIndicators();
      summary.textContent = opts.summary || "";
      summary.hidden = !opts.summary;
      liquidation.setData(opts.liquidation || null);
      // primeiro a altura final do gráfico, depois os painéis (as alturas deles partem dela)
      // (1 painel de volume sempre que há velas + 3 de futuros quando há dados + 1 de liquidações reais)
      wrap.style.setProperty(
        "--sub-panes",
        s.points?.length ? 1 + (opts.futures ? 3 : 0) + (opts.liquidations ? 1 : 0) : 0
      );
      futures.update(s.points, s.interval, opts.futures || null, opts.liquidations || null);
      futures.setVolumeAverages((opts.indicators || []).filter((m) => m.kind === "vma" && m.visible));
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
      removeIndicators();
      liquidation.setData(null);
      measure.clear();
      drawings.setAsset(null);
      futures.remove();
      wrap.style.setProperty("--sub-panes", 0);
      s.points = null;
      s.opts = null;
      if (els.legend) els.legend.innerHTML = "";
      offTop.hidden = offBottom.hidden = true;
      summary.hidden = true;
      tooltip.hide();
    },
  };
}

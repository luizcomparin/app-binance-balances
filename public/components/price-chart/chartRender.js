// Gráfico de preço com TradingView Lightweight Charts: linha ou velas, zoom/arrasto, preço médio,
// suas ordens (marcadores no preço exato), ordens abertas (linhas no eixo), tooltip e simulador.
import { formatPrice, formatQty } from "../../core/format.js";
import { isSimEnabled, simBox } from "./buySimulator.js";

const LWC = window.LightweightCharts;

const COLORS = {
  up: "#52ffa8",
  down: "#ff7272",
  line: "#4dd4ff",
  avg: "rgba(247, 147, 26, 0.95)",
  projected: "rgba(196, 140, 255, 0.95)",
  openBuy: "rgba(82, 255, 168, 0.6)",
  openSell: "rgba(255, 114, 114, 0.6)",
};

// Velas intradiárias são exibidas no horário local; diárias/semanais seguem o dia UTC (igual à Binance)
const INTRADAY = new Set(["1h", "4h"]);

// O Lightweight Charts mostra o tempo como UTC: desloca pelo fuso para exibir hora local
function toChartTime(ms, interval) {
  const shift = INTRADAY.has(interval) ? new Date(ms).getTimezoneOffset() * 60000 : 0;
  return Math.floor((ms - shift) / 1000);
}

// Inverso de toChartTime (aproximado no fuso atual; suficiente para enquadrar janelas)
function fromChartTime(t, interval) {
  const ms = t * 1000;
  return INTRADAY.has(interval) ? ms + new Date(ms).getTimezoneOffset() * 60000 : ms;
}

function formatChartTime(t, withTime = true) {
  return new Date(t * 1000).toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const formatDateTime = (ms) =>
  new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2).formatCurrency()}%`;

// Casas decimais do eixo conforme a grandeza do preço (BTC 2 casas, PEPE 8+)
function priceFormatFor(price) {
  const p = Math.abs(price || 0);
  const precision = p >= 1000 ? 2 : p >= 1 ? 4 : p > 0 ? Math.min(12, Math.ceil(-Math.log10(p)) + 3) : 4;
  return { type: "price", precision, minMove: 10 ** -precision };
}

// Valores do eixo/mira arredondados à precisão da moeda: evita resíduos de ponto flutuante
// como 0,0000000000000002776 na marca que deveria ser 0
function formatAxisPrice(p, precision) {
  const rounded = Number(Number(p).toFixed(precision));
  return formatPrice(Object.is(rounded, -0) ? 0 : rounded);
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Linhas do tooltip de uma ordem sua (hover no marcador)
function orderDetails(m, currentPrice) {
  const o = m.order;
  const lines = [`Par: ${o.baseAsset}/${o.quoteAsset}`, `Quantidade: ${formatQty(o.qty)} ${o.baseAsset}`];
  if (o.quoteAsset !== "USDT") {
    lines.push(`Preço: ${formatPrice(o.avgPrice)} ${o.quoteAsset} (≈ ${formatPrice(m.y)} USDT)`);
    lines.push(`Total: ${formatPrice(o.quoteQty)} ${o.quoteAsset} (≈ ${o.totalUSDT.toFixed(2).formatCurrency()} USDT)`);
  } else {
    lines.push(`Preço: ${formatPrice(m.y)} USDT`);
    lines.push(`Total: ${o.totalUSDT.toFixed(2).formatCurrency()} USDT`);
  }
  if (o.feeUSDT) lines.push(`Taxa: ≈ ${formatPrice(o.feeUSDT)} USDT`);
  if (o.fills > 1) lines.push(`Executada em ${o.fills} partes`);

  if (currentPrice) {
    const diff = ((currentPrice - m.y) / m.y) * 100;
    if (o.side === "BUY") {
      // quanto essa compra vale hoje
      lines.push(`Hoje: ${formatPct(diff)} (${(o.qty * currentPrice).toFixed(2).formatCurrency()} USDT)`);
    } else {
      // se não tivesse vendido: positivo = vendeu cedo demais, negativo = vendeu bem
      lines.push(`Preço atual vs. venda: ${formatPct(diff)}`);
    }
  }
  return lines;
}

function orderSummary(m) {
  const o = m.order;
  return `${o.side === "BUY" ? "Compra" : "Venda"} ${formatDateTime(o.time)}: ${formatQty(o.qty)} ${o.baseAsset} a ${formatPrice(m.y)} (${o.totalUSDT.toFixed(2).formatCurrency()} USDT)`;
}

// Etiqueta da linha de ordem aberta: "V 0,00033 · 49,30 USDT" (total na moeda de cotação do par)
function openOrderTitle(prefix, it) {
  const quote = it.order.quoteAsset || "USDT";
  const total = Number(it.order.totalQuote) || it.qty * (Number(it.order.price) || Number(it.order.stopPrice) || 0);
  const totalText = ["USDT", "FDUSD", "USDC", "BRL"].includes(quote) ? total.toFixed(2).formatCurrency() : formatPrice(total);
  return `${prefix} ${formatQty(it.qty)} · ${totalText} ${quote}`;
}

const sideTitle = (o) => `${o.side === "BUY" ? "Compra" : "Venda"} · ${formatDateTime(o.time)}`;

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
  const { container, wrap, legend } = els;

  const s = {
    series: null,
    mode: null,
    markersApi: null,
    priceLines: [],
    points: null,
    interval: null,
    timeIndex: new Map(),
    precision: 4, // casas decimais do eixo (definidas pela grandeza do preço)
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

  // tooltip/caixa do simulador e resumo das ordens abertas fora da tela (HTML sobre o gráfico)
  const tip = document.createElement("div");
  tip.className = "lwc-tooltip";
  tip.hidden = true;
  wrap.appendChild(tip);

  const offTop = document.createElement("div");
  offTop.className = "lwc-offscreen top";
  const offBottom = document.createElement("div");
  offBottom.className = "lwc-offscreen bottom";
  wrap.append(offTop, offBottom);

  // ---------------------------------------------------------------------------
  // séries
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
    chart.timeScale().setVisibleRange({
      from: toChartTime(from, s.interval),
      to: toChartTime(to, s.interval),
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

  // ---------------------------------------------------------------------------
  // preço médio, ordens abertas e suas ordens
  // ---------------------------------------------------------------------------

  function drawPriceLines() {
    for (const line of s.priceLines) s.series.removePriceLine(line);
    s.priceLines = [];
    const add = (o) => s.priceLines.push(s.series.createPriceLine({ axisLabelVisible: true, ...o }));
    const { avg, projectedAvg, openOrders } = s.opts;

    if (avg) add({ price: avg, color: COLORS.avg, lineWidth: 2, lineStyle: LWC.LineStyle.Dashed, title: "Preço médio" });
    if (projectedAvg) {
      add({
        price: projectedAvg,
        color: COLORS.projected,
        lineWidth: 2,
        lineStyle: LWC.LineStyle.LargeDashed,
        title: "Médio após compras",
      });
    }
    if (openOrders && !s.hidden.openBuys) {
      for (const it of openOrders.buys) {
        add({ price: it.priceUSDT, color: COLORS.openBuy, lineWidth: 1, lineStyle: LWC.LineStyle.Dotted, title: openOrderTitle("C", it) });
      }
    }
    if (openOrders && !s.hidden.openSells) {
      for (const it of openOrders.sells) {
        add({ price: it.priceUSDT, color: COLORS.openSell, lineWidth: 1, lineStyle: LWC.LineStyle.Dotted, title: openOrderTitle("V", it) });
      }
    }
  }

  function visibleMyOrders() {
    const { buys, sells } = s.opts.orders;
    return [...(s.hidden.myBuys ? [] : buys), ...(s.hidden.mySells ? [] : sells)];
  }

  function drawMarkers() {
    const markers = [];
    for (const m of visibleMyOrders()) {
      const p = s.points[m.idx];
      if (!p) continue;
      const buy = m.order.side === "BUY";
      markers.push({
        time: toChartTime(p.time, s.interval),
        position: "atPriceMiddle",
        price: m.y,
        color: buy ? COLORS.up : COLORS.down,
        shape: "circle",
        size: 1,
      });
    }
    markers.sort((a, b) => a.time - b.time);
    s.markersApi.setMarkers(markers);
  }

  // ---------------------------------------------------------------------------
  // legenda (com liga/desliga) e ordens abertas fora da área visível
  // ---------------------------------------------------------------------------

  function renderLegend() {
    if (!legend) return;
    const { avg, projectedAvg, orders, openOrders } = s.opts;
    const item = (swatch, text, key) => {
      const off = key && s.hidden[key];
      const attrs = key ? ` data-toggle="${key}" title="Clique para ${off ? "mostrar" : "esconder"}"` : "";
      return `<span class="lg-item${key ? " toggle" : ""}${off ? " off" : ""}"${attrs}><i class="sw ${swatch}"></i>${text}</span>`;
    };
    const items = [];
    if (avg) items.push(item("sw-avg", `Preço médio: ${formatPrice(avg)}`));
    if (projectedAvg) items.push(item("sw-projected", `Médio após compras abertas: ${formatPrice(projectedAvg)}`));
    if (orders.buys.length) items.push(item("sw-buy", `Suas compras (${orders.buys.length})`, "myBuys"));
    if (orders.sells.length) items.push(item("sw-sell", `Suas vendas (${orders.sells.length})`, "mySells"));
    if (openOrders?.buys.length) items.push(item("sw-open-buy", `Compras abertas (${openOrders.buys.length})`, "openBuys"));
    if (openOrders?.sells.length) items.push(item("sw-open-sell", `Vendas abertas (${openOrders.sells.length})`, "openSells"));
    items.push(`<button type="button" class="ghost lg-fit" data-action="fit" title="Enquadrar todo o período carregado">Ajustar zoom</button>`);
    legend.innerHTML = items.join("");
  }

  legend?.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="fit"]')) {
      lastFrom = null;
      chart.timeScale().fitContent();
      chart.priceScale("right").applyOptions({ autoScale: true });
      return;
    }
    const key = e.target.closest("[data-toggle]")?.dataset.toggle;
    if (!key || !s.opts) return;
    s.hidden[key] = !s.hidden[key];
    drawPriceLines();
    drawMarkers();
    renderLegend();
    updateOffscreen();
  });

  function updateOffscreen() {
    const oo = s.opts?.openOrders;
    const height = s.series ? chart.paneSize(0)?.height : 0;
    if (!oo || !height) {
      offTop.hidden = offBottom.hidden = true;
      return;
    }
    const top = s.series.coordinateToPrice(0);
    const bottom = s.series.coordinateToPrice(height);
    const above = { BUY: 0, SELL: 0 };
    const below = { BUY: 0, SELL: 0 };
    const count = (list, side) => {
      for (const it of list) {
        if (top !== null && it.priceUSDT > top) above[side]++;
        else if (bottom !== null && it.priceUSDT < bottom) below[side]++;
      }
    };
    if (!s.hidden.openBuys) count(oo.buys, "BUY");
    if (!s.hidden.openSells) count(oo.sells, "SELL");

    const text = (c, dir, where) =>
      [
        c.SELL ? `${c.SELL} venda${c.SELL > 1 ? "s" : ""}` : null,
        c.BUY ? `${c.BUY} compra${c.BUY > 1 ? "s" : ""}` : null,
      ]
        .filter(Boolean)
        .map((t) => `${dir} ${t}`)
        .join(" · ") + (c.SELL || c.BUY ? ` ${where}` : "");
    offTop.textContent = text(above, "↑", "acima");
    offBottom.textContent = text(below, "↓", "abaixo");
    offTop.hidden = !offTop.textContent;
    offBottom.hidden = !offBottom.textContent;
  }

  let offscreenFrame = 0;
  const scheduleOffscreen = () => {
    cancelAnimationFrame(offscreenFrame);
    offscreenFrame = requestAnimationFrame(updateOffscreen);
  };

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

  function showTip(point, html, cls = "") {
    tip.className = `lwc-tooltip ${cls}`;
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const maxX = container.clientWidth;
    const maxY = container.clientHeight;
    let x = point.x + pad;
    if (x + w > maxX - 60) x = point.x - pad - w; // 60 ≈ eixo de preço
    let y = point.y + pad;
    if (y + h > maxY) y = point.y - pad - h;
    tip.style.left = `${Math.max(0, x)}px`;
    tip.style.top = `${Math.max(0, y)}px`;
  }

  function hideTip() {
    tip.hidden = true;
  }

  const lines = (arr) => arr.map((l) => `<div>${escapeHtml(l)}</div>`).join("");

  chart.subscribeCrosshairMove((param) => {
    scheduleOffscreen();
    if (!s.series || !s.points || !param.point || param.time === undefined) return hideTip();

    if (isSimEnabled()) {
      const price = s.series.coordinateToPrice(param.point.y);
      if (price === null) return hideTip();
      const box = simBox(price);
      return showTip(param.point, `<div class="tt-sim-title">${escapeHtml(box.lines[0])}</div>${lines(box.lines.slice(1))}`, `sim ${box.status}`);
    }

    const idx = s.timeIndex.get(param.time);
    if (idx === undefined) return hideTip();
    const p = s.points[idx];
    const currentPrice = s.points.at(-1)?.close ?? null;
    const atCandle = visibleMyOrders().filter((m) => m.idx === idx);

    // mouse em cima de um marcador → detalhes da(s) ordem(ns)
    const hovered = atCandle.filter((m) => {
      const y = s.series.priceToCoordinate(m.y);
      return y !== null && Math.abs(y - param.point.y) <= 8;
    });
    if (hovered.length) {
      const html = hovered
        .map((m) => `<div class="tt-title ${m.order.side === "BUY" ? "buy" : "sell"}">${escapeHtml(sideTitle(m.order))}</div>${lines(orderDetails(m, currentPrice))}`)
        .join('<div class="tt-sep"></div>');
      return showTip(param.point, html);
    }

    // senão → a vela sob o mouse
    const body = [];
    if (s.mode === "candle") {
      const chg = p.open ? ((p.close - p.open) / p.open) * 100 : 0;
      body.push(`Abertura: ${formatPrice(p.open)}`, `Máxima: ${formatPrice(p.high)}`, `Mínima: ${formatPrice(p.low)}`);
      body.push(`Fechamento: ${formatPrice(p.close)} (${formatPct(chg)})`);
    } else {
      body.push(`Preço: ${formatPrice(p.close)} USDT`);
    }
    let html = `<div class="tt-title">${escapeHtml(formatChartTime(param.time, INTRADAY.has(s.interval)))}</div>${lines(body)}`;
    if (atCandle.length) {
      html += `<div class="tt-sep"></div>${atCandle.map((m) => `<div class="${m.order.side === "BUY" ? "buy" : "sell"}">● ${escapeHtml(orderSummary(m))}</div>`).join("")}`;
    }
    showTip(param.point, html);
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
      chart.applyOptions({ timeScale: { timeVisible: INTRADAY.has(opts.interval), secondsVisible: false } });

      if (dataChanged) setSeriesData(opts.prepended || 0, opts.window);
      else if (opts.window !== undefined) showWindow(opts.window);

      drawPriceLines();
      drawMarkers();
      renderLegend();
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
      if (legend) legend.innerHTML = "";
      offTop.hidden = offBottom.hidden = true;
      hideTip();
    },
  };
}

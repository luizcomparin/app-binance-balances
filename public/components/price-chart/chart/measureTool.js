// Régua de medição (igual ao TradingView): Shift + clique marca o início, o mouse estica a área,
// um clique fixa a medida e o próximo clique apaga. Esc cancela.
// Mostra a variação de preço (valor e %), quantas velas, o tempo e o volume (USDT) entre os dois pontos.
import { formatPrice } from "../../../core/format.js";
import { formatUsdShort } from "../../../core/format.js";
import { INTERVAL_MS } from "../timeframe.js";

const UP = { fill: "rgba(41, 98, 255, 0.2)", line: "#2962ff", box: "rgba(41, 98, 255, 0.92)" };
const DOWN = { fill: "rgba(242, 54, 69, 0.2)", line: "#f23645", box: "rgba(242, 54, 69, 0.92)" };
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// "19d" / "4d 12h" / "8h" / "3 meses"
function formatSpan(bars, interval) {
  if (interval === "1M") return `${bars} ${bars === 1 ? "mês" : "meses"}`;
  const ms = bars * (INTERVAL_MS[interval] || DAY);
  const d = Math.floor(ms / DAY);
  const h = Math.round((ms - d * DAY) / HOUR);
  if (!d) return `${h}h`;
  return h ? `${d}d ${h}h` : `${d}d`;
}

const pct = (v) => `${v.toFixed(2).replace(".", ",")}%`;

/**
 * chart: instância do Lightweight Charts
 * getSeries/getPoints/getInterval: estado atual do gráfico (série principal, velas, tamanho da vela)
 * Devolve { primitive, move(param), clear() }; o primitive deve ser anexado à série principal.
 */
export function createMeasureTool(chart, { getSeries, getPoints, getInterval }) {
  // pontos guardados pelo tempo da vela (+ velas além do fim/início dos dados): continuam certos
  // quando o histórico antigo é carregado e os índices das velas mudam
  let start = null;
  let end = null;
  let phase = "idle"; // idle | drawing (o fim segue o mouse) | fixed
  let requestUpdate = null;
  let shiftHeld = false;

  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") shiftHeld = true;
    // Esc digitado num campo (busca, período, indicadores) não cancela a medida
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "Escape" && phase !== "idle") clear();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") shiftHeld = false;
  });
  window.addEventListener("blur", () => (shiftHeld = false));

  function toAnchor(idx, price) {
    const pts = getPoints();
    const base = Math.min(Math.max(idx, 0), pts.length - 1);
    return { ms: pts[base].time, extra: idx - base, price };
  }

  function indexOf(anchor) {
    const pts = getPoints();
    let lo = 0;
    let hi = pts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].time === anchor.ms) return mid + anchor.extra;
      if (pts[mid].time < anchor.ms) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }

  // posição do mouse no painel de preço → ponto da régua (null fora dele)
  function anchorFrom(param) {
    const series = getSeries();
    if (!series || !getPoints()?.length || !param.point || param.paneIndex || param.logical === undefined) return null;
    const price = series.coordinateToPrice(param.point.y);
    return price === null ? null : toAnchor(Math.round(param.logical), price);
  }

  function clear() {
    start = end = null;
    phase = "idle";
    requestUpdate?.();
  }

  chart.subscribeClick((param) => {
    const anchor = anchorFrom(param);
    if (phase === "drawing") {
      if (anchor) end = anchor;
      phase = "fixed";
      requestUpdate?.();
      return;
    }
    const shift = param.sourceEvent?.shiftKey ?? shiftHeld;
    if (shift && anchor) {
      start = end = anchor;
      phase = "drawing";
      requestUpdate?.();
    } else if (phase === "fixed") {
      clear();
    }
  });

  // ---------------------------------------------------------------------------
  // desenho
  // ---------------------------------------------------------------------------

  function draw(target) {
    const series = getSeries();
    const pts = getPoints();
    if (phase === "idle" || !series || !pts?.length) return;
    const i1 = indexOf(start);
    const i2 = indexOf(end);
    if (i1 === null || i2 === null) return;
    const ts = chart.timeScale();
    const x1 = ts.logicalToCoordinate(i1);
    const x2 = ts.logicalToCoordinate(i2);
    const y1 = series.priceToCoordinate(start.price);
    const y2 = series.priceToCoordinate(end.price);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;

    const diff = end.price - start.price;
    const c = diff >= 0 ? UP : DOWN;
    const bars = i2 - i1;
    const lo = Math.max(0, Math.min(i1, i2));
    const hi = Math.min(pts.length - 1, Math.max(i1, i2));
    let vol = 0;
    for (let i = lo; i <= hi; i++) vol += pts[i].volume || 0;
    const lines = [
      `${formatPrice(diff)} (${pct((diff / start.price) * 100)})`,
      `${bars} ${Math.abs(bars) === 1 ? "barra" : "barras"}, ${formatSpan(Math.abs(bars), getInterval())}`,
      `Vol ${formatUsdShort(vol)}`,
    ];

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const [ax1, ax2, ay1, ay2] = [x1 * hr, x2 * hr, y1 * vr, y2 * vr];
      const left = Math.min(ax1, ax2);
      const top = Math.min(ay1, ay2);
      const w = Math.max(1, Math.abs(ax2 - ax1));
      const h = Math.max(1, Math.abs(ay2 - ay1));
      const midX = (ax1 + ax2) / 2;
      const midY = (ay1 + ay2) / 2;

      ctx.fillStyle = c.fill;
      ctx.fillRect(left, top, w, h);

      // setas: vertical (início → fim do preço) e horizontal (início → fim do tempo)
      ctx.strokeStyle = c.line;
      ctx.fillStyle = c.line;
      ctx.lineWidth = Math.max(1, hr);
      const head = 6 * hr;
      ctx.beginPath();
      ctx.moveTo(midX, ay1);
      ctx.lineTo(midX, ay2);
      ctx.moveTo(ax1, midY);
      ctx.lineTo(ax2, midY);
      ctx.stroke();
      if (h > head) {
        const dir = ay2 > ay1 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(midX, ay2);
        ctx.lineTo(midX - head * 0.7, ay2 - dir * head);
        ctx.lineTo(midX + head * 0.7, ay2 - dir * head);
        ctx.fill();
      }
      if (w > head) {
        const dir = ax2 > ax1 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(ax2, midY);
        ctx.lineTo(ax2 - dir * head, midY - head * 0.7);
        ctx.lineTo(ax2 - dir * head, midY + head * 0.7);
        ctx.fill();
      }

      // etiqueta: acima da área quando sobe, abaixo quando cai (sem sair do painel)
      ctx.font = `600 ${Math.round(12 * vr)}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lineH = 18 * vr;
      const padX = 10 * hr;
      const padY = 6 * vr;
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      const boxH = lines.length * lineH + padY * 2;
      const gap = 6 * vr;
      let boxY = diff >= 0 ? top - gap - boxH : top + h + gap;
      boxY = Math.min(Math.max(boxY, 2 * vr), bitmapSize.height - boxH - 2 * vr);
      const boxX = Math.min(Math.max(midX - boxW / 2, 2 * hr), bitmapSize.width - boxW - 2 * hr);
      ctx.fillStyle = c.box;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 4 * hr);
      else ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fill();
      ctx.fillStyle = "#fff";
      lines.forEach((l, i) => ctx.fillText(l, boxX + boxW / 2, boxY + padY + lineH * (i + 0.5)));
    });
  }

  const view = { zOrder: () => "top", renderer: () => ({ draw }) };
  const primitive = {
    attached(p) {
      requestUpdate = p.requestUpdate;
    },
    detached() {
      requestUpdate = null;
    },
    updateAllViews() {},
    paneViews: () => [view],
  };

  return {
    primitive,
    clear,
    /** medição em andamento (o segundo clique ainda não foi dado) */
    busy: () => phase === "drawing",
    /** mira mexeu: durante a medição o fim segue o mouse. true = medindo (esconder a tooltip da vela) */
    move(param) {
      if (phase !== "drawing") return false;
      const anchor = anchorFrom(param);
      if (anchor) {
        end = anchor;
        requestUpdate?.();
      }
      return true;
    },
  };
}

// Ferramentas de desenho no gráfico: linha de tendência, raio, linha horizontal, retângulo e canal paralelo.
//   - com uma ferramenta escolhida, cada clique marca um ponto (horizontal: 1, canal: 3, demais: 2);
//     terminado o desenho, a ferramenta volta ao cursor (igual ao TradingView);
//   - clicar num desenho seleciona; arrastar move (pelo corpo) ou edita (pelas bolinhas);
//   - Del/Backspace apaga o selecionado; Esc cancela o desenho em andamento ou tira a seleção;
//   - os pontos são guardados pelo instante (ms) e preço: valem em qualquer tamanho de vela e
//     continuam no lugar quando o histórico antigo é carregado; salvos no navegador por moeda.
import { INTERVAL_MS } from "../timeframe.js";

const COLOR = "#2962ff";
const FILL = "rgba(41, 98, 255, 0.15)";
const HANDLE_FILL = "#0b1024";
const HIT = 6; // px: distância do mouse a uma linha para pegar o desenho
const HANDLE_HIT = 8;
const HANDLE_R = 5;
const STORAGE_KEY = "price-chart-drawings";

// handles: [ponto do tempo, ponto do preço, deslocado pelo canal?]
export const TOOLS = {
  trend: { label: "Linha de tendência", clicks: 2, stored: 2, handles: [[0, 0], [1, 1]] },
  ray: { label: "Raio", clicks: 2, stored: 2, handles: [[0, 0], [1, 1]] },
  hline: { label: "Linha horizontal", clicks: 1, stored: 1, handles: [[0, 0]] },
  rect: { label: "Retângulo", clicks: 2, stored: 2, handles: [[0, 0], [1, 1], [0, 1], [1, 0]] },
  channel: { label: "Canal paralelo", clicks: 3, stored: 2, handles: [[0, 0], [1, 1], [0, 0, true], [1, 1, true]] },
};

// ---------------------------------------------------------------------------
// geometria (px)
// ---------------------------------------------------------------------------

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insidePolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function validDrawing(d) {
  const tool = d && TOOLS[d.type];
  if (!tool || !Array.isArray(d.points) || d.points.length !== tool.stored) return false;
  if (!d.points.every((p) => Number.isFinite(p?.ms) && Number.isFinite(p?.price))) return false;
  return d.type !== "channel" || Number.isFinite(d.dp);
}

function loadAll() {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

/**
 * chart: instância do Lightweight Charts; container: elemento do gráfico
 * getSeries/getPoints/getInterval: estado atual; formatPrice: texto da etiqueta no eixo
 * isBusy(): régua de medição em andamento (ela tem prioridade nos cliques)
 * onToolChange(tool|null): ferramenta ativa mudou (para a barra de ferramentas)
 */
export function createDrawings(chart, { container, getSeries, getPoints, getInterval, formatPrice, isBusy, onToolChange }) {
  let asset = null;
  let items = []; // { id, type, points: [{ ms, price }], dp? (canal: distância de preço da linha paralela) }
  let selected = null;
  let hovered = null;
  let tool = null;
  let draft = null; // desenho em andamento: { type, points, cursor }
  let drag = null;
  let requestUpdate = null;

  const redraw = () => requestUpdate?.();
  const ready = () => !!getSeries() && getPoints()?.length > 0;
  const ts = () => chart.timeScale();
  const step = () => INTERVAL_MS[getInterval()] || 24 * 3600 * 1000;

  // ---- instante ↔ índice (fracionário) da vela; antes/depois dos dados, extrapola pela duração da vela
  function msToIdx(ms) {
    const pts = getPoints();
    const n = pts.length;
    if (ms <= pts[0].time) return (ms - pts[0].time) / step();
    if (ms >= pts[n - 1].time) return n - 1 + (ms - pts[n - 1].time) / step();
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].time <= ms) lo = mid;
      else hi = mid - 1;
    }
    return lo + (ms - pts[lo].time) / (pts[lo + 1].time - pts[lo].time);
  }

  function idxToMs(idx) {
    const pts = getPoints();
    const n = pts.length;
    if (idx <= 0) return pts[0].time + idx * step();
    if (idx >= n - 1) return pts[n - 1].time + (idx - (n - 1)) * step();
    const f = Math.floor(idx);
    return pts[f].time + (idx - f) * (pts[f + 1].time - pts[f].time);
  }

  // logicalToCoordinate só aceita índices inteiros: interpola entre velas vizinhas
  function idxToX(idx) {
    const f = Math.floor(idx);
    const x0 = ts().logicalToCoordinate(f);
    if (x0 === null || idx === f) return x0;
    const x1 = ts().logicalToCoordinate(f + 1);
    return x1 === null ? x0 : x0 + (idx - f) * (x1 - x0);
  }

  function toXY(ms, price) {
    const x = idxToX(msToIdx(ms));
    const y = getSeries().priceToCoordinate(price);
    return x === null || y === null ? null : { x, y };
  }

  // preço da reta p0→p1 no instante ms (base do canal paralelo)
  function priceOnLine(p0, p1, ms) {
    const i0 = msToIdx(p0.ms);
    const i1 = msToIdx(p1.ms);
    if (i1 === i0) return p0.price;
    return p0.price + ((p1.price - p0.price) * (msToIdx(ms) - i0)) / (i1 - i0);
  }

  // ---- forma de cada desenho em px: segmentos (linhas), polígono (preenchimento), linha do meio (canal)
  function geom(d) {
    const pane = chart.paneSize(0);
    if (!pane) return null;
    const [a, b] = d.points.map((p) => toXY(p.ms, p.price));
    if (!a || (d.points.length > 1 && !b)) return null;
    switch (d.type) {
      case "trend":
        return { segs: [[a, b]] };
      case "ray": {
        // prolonga a partir do 2º ponto até bem além da borda (o canvas corta)
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const k = (2 * (pane.width + pane.height)) / (Math.hypot(dx, dy) || 1);
        return { segs: [[a, { x: a.x + dx * k, y: a.y + dy * k }]] };
      }
      case "hline":
        return { segs: [[{ x: 0, y: a.y }, { x: pane.width, y: a.y }]] };
      case "rect": {
        const poly = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        return { segs: poly.map((p, i) => [p, poly[(i + 1) % 4]]), poly };
      }
      case "channel": {
        const a2 = toXY(d.points[0].ms, d.points[0].price + d.dp);
        const b2 = toXY(d.points[1].ms, d.points[1].price + d.dp);
        if (!a2 || !b2) return null;
        return {
          segs: [[a, b], [a2, b2]],
          poly: [a, b, b2, a2],
          mid: [{ x: a.x, y: (a.y + a2.y) / 2 }, { x: b.x, y: (b.y + b2.y) / 2 }],
        };
      }
    }
    return null;
  }

  const handlesOf = (d) =>
    TOOLS[d.type].handles.map(([t, p, shifted]) => toXY(d.points[t].ms, d.points[p].price + (shifted ? d.dp : 0)));

  // desenho em andamento, com o mouse como próximo ponto
  function draftDrawing() {
    if (!draft?.points.length || !draft.cursor) return null;
    const pts = [...draft.points, draft.cursor];
    if (draft.type !== "channel") return { type: draft.type, points: pts };
    if (pts.length === 2) return { type: "channel", points: pts, dp: 0 };
    return { type: "channel", points: pts.slice(0, 2), dp: draft.cursor.price - priceOnLine(pts[0], pts[1], draft.cursor.ms) };
  }

  // o que está sob o mouse: bolinha de edição (handle >= 0) ou o desenho em si (handle -1)
  function hitTest(pt) {
    const top = [...items].reverse(); // o mais recente fica por cima
    const sel = items.find((d) => d.id === selected);
    for (const d of sel ? [sel, ...top] : top) {
      const k = handlesOf(d).findIndex((h) => h && Math.hypot(h.x - pt.x, h.y - pt.y) <= HANDLE_HIT);
      if (k >= 0) return { d, handle: k };
    }
    for (const d of top) {
      const g = geom(d);
      if (!g) continue;
      if (g.segs.some(([a, b]) => distToSegment(pt, a, b) <= HIT) || (g.poly && insidePolygon(pt, g.poly))) {
        return { d, handle: -1 };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // desenho no canvas
  // ---------------------------------------------------------------------------

  function draw(target) {
    if (!ready()) return;
    const preview = draftDrawing();
    const list = preview ? [...items, preview] : items;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const P = (p) => [p.x * hr, p.y * vr];
      for (const d of list) {
        const g = geom(d);
        if (!g) continue;
        if (g.poly) {
          ctx.fillStyle = FILL;
          ctx.beginPath();
          g.poly.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = COLOR;
        ctx.lineWidth = 2 * hr;
        ctx.beginPath();
        for (const [a, b] of g.segs) {
          ctx.moveTo(...P(a));
          ctx.lineTo(...P(b));
        }
        ctx.stroke();
        if (g.mid) {
          ctx.lineWidth = hr;
          ctx.setLineDash([6 * hr, 4 * hr]);
          ctx.beginPath();
          ctx.moveTo(...P(g.mid[0]));
          ctx.lineTo(...P(g.mid[1]));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (d === preview || d.id === selected || d.id === hovered) {
          ctx.lineWidth = 1.5 * hr;
          ctx.fillStyle = HANDLE_FILL;
          for (const h of handlesOf(d)) {
            if (!h) continue;
            ctx.beginPath();
            ctx.arc(...P(h), HANDLE_R * hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
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
    // etiqueta de preço no eixo para cada linha horizontal
    priceAxisViews: () =>
      items
        .filter((d) => d.type === "hline")
        .map((d) => {
          const y = () => getSeries()?.priceToCoordinate(d.points[0].price) ?? null;
          return {
            coordinate: () => y() ?? 0,
            text: () => formatPrice(d.points[0].price),
            textColor: () => "#fff",
            backColor: () => COLOR,
            visible: () => y() !== null,
            tickVisible: () => true,
          };
        }),
  };

  // ---------------------------------------------------------------------------
  // estado salvo
  // ---------------------------------------------------------------------------

  function save() {
    if (!asset) return;
    try {
      const all = loadAll();
      if (items.length) all[asset] = items;
      else delete all[asset];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // sem armazenamento (modo privado etc.): os desenhos valem só até recarregar
    }
  }

  function setTool(next) {
    tool = next && TOOLS[next] ? next : null;
    draft = null;
    container.classList.toggle("is-placing", !!tool);
    onToolChange?.(tool);
    redraw();
  }

  function remove(id) {
    items = items.filter((d) => d.id !== id);
    if (selected === id) selected = null;
    if (hovered === id) hovered = null;
    save();
    redraw();
  }

  // ---------------------------------------------------------------------------
  // mouse e teclado
  // ---------------------------------------------------------------------------

  function anchorFrom(param) {
    if (!ready() || !param.point || param.paneIndex || param.logical === undefined) return null;
    const price = getSeries().coordinateToPrice(param.point.y);
    return price === null ? null : { ms: idxToMs(Math.round(param.logical)), price };
  }

  function finishDraft() {
    const pts = draft.points;
    const d = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type: draft.type };
    if (d.type === "channel") {
      d.points = pts.slice(0, 2);
      d.dp = pts[2].price - priceOnLine(pts[0], pts[1], pts[2].ms);
    } else {
      d.points = pts;
    }
    items.push(d);
    selected = d.id;
    save();
    setTool(null);
  }

  // cliques: marcar pontos (com ferramenta) ou tirar a seleção (clique fora dos desenhos)
  chart.subscribeClick((param) => {
    if (param.sourceEvent?.shiftKey || isBusy?.()) return; // Shift + clique é da régua de medição
    if (tool) {
      const anchor = anchorFrom(param);
      if (!anchor) return;
      draft ??= { type: tool, points: [], cursor: null };
      draft.points.push(anchor);
      draft.cursor = anchor;
      if (draft.points.length === TOOLS[tool].clicks) finishDraft();
      else redraw();
      return;
    }
    if (param.point && !param.paneIndex && ready() && hitTest(param.point)) return;
    if (selected) {
      selected = null;
      redraw();
    }
  });

  const local = (e) => {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inPane = (pt) => {
    const pane = chart.paneSize(0);
    return !!pane && pt.x >= 0 && pt.y >= 0 && pt.x <= pane.width && pt.y <= pane.height;
  };

  // apertar em cima de um desenho: seleciona e começa a arrastar (o gráfico não recebe o clique,
  // senão arrastaria junto)
  container.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || tool || e.shiftKey || isBusy?.() || !ready()) return;
      const pt = local(e);
      if (!inPane(pt)) return;
      const hit = hitTest(pt);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      selected = hit.d.id;
      drag = {
        d: hit.d,
        handle: hit.handle,
        startIdx: ts().coordinateToLogical(pt.x),
        startPrice: getSeries().coordinateToPrice(pt.y),
        orig: hit.d.points.map((p) => ({ ...p })),
        moved: false,
      };
      redraw();
    },
    { capture: true }
  );
  container.addEventListener(
    "mousedown",
    (e) => {
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true }
  );

  window.addEventListener("pointermove", (e) => {
    if (!drag || !ready()) return;
    const pt = local(e);
    const logical = ts().coordinateToLogical(pt.x);
    const price = getSeries().coordinateToPrice(pt.y);
    if (logical === null || price === null) return;
    const d = drag.d;
    drag.moved = true;
    if (drag.handle >= 0) {
      const [t, p, shifted] = TOOLS[d.type].handles[drag.handle];
      if (shifted) {
        d.dp = price - priceOnLine(d.points[0], d.points[1], d.points[t].ms);
      } else {
        d.points[t].ms = idxToMs(Math.round(logical));
        d.points[p].price = price;
      }
    } else if (drag.startIdx !== null && drag.startPrice !== null) {
      // corpo: desloca todos os pontos em velas inteiras e no preço
      const di = Math.round(logical - drag.startIdx);
      const dp = price - drag.startPrice;
      d.points = drag.orig.map((p) => ({ ms: idxToMs(msToIdx(p.ms) + di), price: p.price + dp }));
    }
    redraw();
  });

  window.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moved) save();
    drag = null;
  });

  // mouse em cima de um desenho: mostra as bolinhas e o cursor de mão
  container.addEventListener("pointermove", (e) => {
    if (drag || tool || !ready()) return;
    const pt = local(e);
    const id = inPane(pt) ? hitTest(pt)?.d.id ?? null : null;
    container.classList.toggle("is-draw-hover", id !== null);
    if (id !== hovered) {
      hovered = id;
      redraw();
    }
  });
  container.addEventListener("pointerleave", () => {
    container.classList.remove("is-draw-hover");
    if (hovered !== null && !drag) {
      hovered = null;
      redraw();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "Escape") {
      if (tool) setTool(null);
      else if (selected) {
        selected = null;
        redraw();
      }
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected && !drag) {
      e.preventDefault();
      remove(selected);
    }
  });

  return {
    primitive,
    setTool,

    /** mira mexeu: com uma ferramenta ativa, o próximo ponto segue o mouse. true = esconder a tooltip */
    move(param) {
      if (!tool) return false;
      const anchor = anchorFrom(param);
      if (draft && anchor) {
        draft.cursor = anchor;
        redraw();
      }
      return true;
    },

    /** moeda exibida: carrega os desenhos salvos dela (null = nenhuma) */
    setAsset(next) {
      if (next === asset) return;
      asset = next || null;
      const saved = asset ? loadAll()[asset] : null;
      items = Array.isArray(saved) ? saved.filter(validDrawing) : [];
      selected = hovered = drag = null;
      if (tool) setTool(null);
      else redraw();
    },
  };
}

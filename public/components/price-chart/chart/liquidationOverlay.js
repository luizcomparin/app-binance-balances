// Mapa de liquidação estimado desenhado sobre o gráfico ("primitive" do Lightweight Charts):
//   - mapa de calor: cada nível estimado é uma faixa horizontal desde que as posições foram abertas até
//     o preço passar por ele (liquidadas) ou até agora; quanto mais forte, mais dinheiro estimado ali;
//   - perfil à direita: o que ainda está pendente, com o valor das maiores concentrações.
// As opções da engrenagem do checkbox (lados, histórico, faixas fracas, opacidade, cores, perfil e
// rótulos) ficam em LIQ_MAP_DEFAULT / normalizeLiqMapSettings; o formulário está em paneSettings.js.
import { formatUsdShort } from "../../../core/format.js";

/** opções padrão do mapa (escala do mapa de calor: pouco dinheiro = roxo apagado → muito = amarelo forte) */
export const LIQ_MAP_DEFAULT = Object.freeze({
  sides: "both", // "both" | "long" (só longs, abaixo do preço) | "short" (só shorts, acima)
  history: true, // faixas que já foram liquidadas ou mudaram (false = só o que ainda está pendente)
  minIntensity: 0.06, // abaixo disso (fração do percentil 98) a faixa não é desenhada
  opacity: 1, // multiplica a transparência do mapa e do perfil
  lowColor: "#5032a0",
  highColor: "#ffd200",
  profile: true, // barras do que está pendente à direita
  labels: 3, // rótulos de valor por lado (acima e abaixo do preço); 0 = nenhum
});
const SIDES = ["both", "long", "short"];
const LABEL_COUNTS = [0, 1, 3, 5];

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const isColor = (c) => /^#[0-9a-f]{6}$/i.test(c ?? "");

/** opções salvas (ou parciais) → opções válidas, com o padrão no que faltar ou estiver fora dos limites */
export function normalizeLiqMapSettings(s) {
  const d = LIQ_MAP_DEFAULT;
  const labels = Number(s?.labels);
  return {
    sides: SIDES.includes(s?.sides) ? s.sides : d.sides,
    history: typeof s?.history === "boolean" ? s.history : d.history,
    minIntensity: clamp(s?.minIntensity, 0, 0.5, d.minIntensity),
    opacity: clamp(s?.opacity, 0.1, 1, d.opacity),
    lowColor: isColor(s?.lowColor) ? s.lowColor : d.lowColor,
    highColor: isColor(s?.highColor) ? s.highColor : d.highColor,
    profile: typeof s?.profile === "boolean" ? s.profile : d.profile,
    labels: LABEL_COUNTS.includes(labels) ? labels : d.labels,
  };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const PROFILE_MAX_WIDTH = 150; // px (CSS)
const DEFAULT_LABEL_RGB = "255, 196, 0"; // texto dos rótulos com a cor forte padrão (com outra cor, a própria)

export class LiquidationOverlay {
  /** timeToX(ms) → coordenada x (CSS) do instante no eixo de tempo, ou null */
  constructor(timeToX) {
    this._timeToX = timeToX;
    this._data = null;
    this._settings = normalizeLiqMapSettings(null);
    const self = this;
    this._view = {
      zOrder: () => "bottom",
      renderer: () => ({ draw: (target) => self._draw(target) }),
    };
  }

  attached({ series, requestUpdate }) {
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._series = this._requestUpdate = null;
  }

  /** data = resposta de /liquidation-map (available: true) ou null para esconder; settings = opções da engrenagem */
  setData(data, settings = this._settings) {
    const s = normalizeLiqMapSettings(settings);
    const settingsChanged = JSON.stringify(s) !== JSON.stringify(this._settings);
    if (data === this._data && !settingsChanged) return;
    this._settings = s;
    this._data = data;
    // normaliza pelo percentil 98 (dos trechos que serão desenhados): um nível gigante não apaga os outros
    const segs = this._segments();
    if (segs.length) {
      const sorted = segs.map((x) => x.u).sort((a, b) => a - b);
      this._scale = Math.max(1, sorted[Math.floor(sorted.length * 0.98)] || sorted.at(-1));
    } else {
      this._scale = 1;
    }
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return [this._view];
  }

  // trechos do mapa de calor conforme as opções de lado e histórico
  _segments() {
    const { sides, history } = this._settings;
    return (this._data?.segments || []).filter(
      (s) => (sides === "both" || s.s === (sides === "long" ? "L" : "S")) && (history || s.t === null)
    );
  }

  _heatColor(v, alpha = 1) {
    const t = Math.min(1, v);
    const low = rgb(this._settings.lowColor);
    const high = rgb(this._settings.highColor);
    const mix = (i) => Math.round(low[i] + (high[i] - low[i]) * t);
    return `rgba(${mix(0)}, ${mix(1)}, ${mix(2)}, ${((0.12 + 0.78 * t ** 1.3) * alpha).toFixed(3)})`;
  }

  _draw(target) {
    const data = this._data;
    const series = this._series;
    if (!data || !series) return;
    const opt = this._settings;

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const width = bitmapSize.width;
      const y = (p) => series.priceToCoordinate(p);
      const halfBucket = data.bucket / 2;
      const bandHeight = (p) => {
        const a = y(p + halfBucket);
        const b = y(p - halfBucket);
        return a === null || b === null ? 1 : Math.max(1, Math.abs(b - a) * vr);
      };

      // mapa de calor
      for (const s of this._segments()) {
        const yc = y(s.p);
        if (yc === null) continue;
        const x1 = this._timeToX(s.f);
        const x2 = s.t === null ? width / hr : this._timeToX(s.t);
        if (x2 === null || x2 < 0) continue;
        const left = Math.max(0, (x1 ?? 0) * hr);
        const right = Math.min(width, x2 * hr);
        if (right <= left) continue;
        const v = s.u / this._scale;
        if (v < opt.minIntensity) continue;
        const h = bandHeight(s.p);
        ctx.fillStyle = this._heatColor(v, opt.opacity);
        ctx.fillRect(left, yc * vr - h / 2, right - left, h);
      }

      if (!opt.profile && !opt.labels) return;

      // perfil do que está pendente (só os níveis dentro da área visível e do lado escolhido)
      const valueOf = (l) => (opt.sides === "long" ? l.long : opt.sides === "short" ? l.short : l.long + l.short);
      const visible = [];
      for (const l of data.levels) {
        const total = valueOf(l);
        if (!total) continue;
        const yc = y(l.price);
        if (yc === null || yc * vr < 0 || yc * vr > bitmapSize.height) continue;
        visible.push({ ...l, total, yc });
      }
      if (!visible.length) return;
      const maxTotal = Math.max(...visible.map((l) => l.total));
      const maxW = opt.profile ? PROFILE_MAX_WIDTH * hr : 0;
      if (opt.profile) {
        for (const l of visible) {
          const w = (l.total / maxTotal) * maxW;
          const h = bandHeight(l.price);
          ctx.fillStyle = this._heatColor(l.total / maxTotal, opt.opacity);
          ctx.fillRect(width - w, l.yc * vr - h / 2, w, h);
        }
      }
      if (!opt.labels) return;

      // valor das maiores concentrações acima e abaixo do preço
      ctx.font = `${Math.round(11 * vr)}px Manrope, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const labelRgb = opt.highColor === LIQ_MAP_DEFAULT.highColor ? DEFAULT_LABEL_RGB : rgb(opt.highColor).join(", ");
      const used = []; // y dos rótulos já desenhados (não sobrepor níveis vizinhos)
      const label = (list) => {
        let count = 0;
        for (const l of [...list].sort((a, b) => b.total - a.total)) {
          if (count >= opt.labels) break;
          if (used.some((uy) => Math.abs(uy - l.yc) < 18)) continue;
          used.push(l.yc);
          count++;
          const w = (l.total / maxTotal) * maxW;
          const text = `≈ ${formatUsdShort(l.total)}`;
          const x = width - w - 6 * hr;
          ctx.fillStyle = "rgba(11, 16, 36, 0.8)";
          const tw = ctx.measureText(text).width;
          ctx.fillRect(x - tw - 4 * hr, l.yc * vr - 8 * vr, tw + 8 * hr, 16 * vr);
          ctx.fillStyle = `rgb(${labelRgb})`;
          ctx.fillText(text, x, l.yc * vr);
        }
      };
      label(visible.filter((l) => l.price > data.price));
      label(visible.filter((l) => l.price < data.price));
    });
  }
}

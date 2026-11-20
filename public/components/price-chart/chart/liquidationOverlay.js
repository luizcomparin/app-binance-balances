// Mapa de liquidação estimado desenhado sobre o gráfico ("primitive" do Lightweight Charts):
//   - mapa de calor: cada nível estimado é uma faixa horizontal desde que as posições foram abertas até
//     o preço passar por ele (liquidadas) ou até agora; quanto mais forte, mais dinheiro estimado ali;
//   - perfil à direita: o que ainda está pendente, com o valor das maiores concentrações.

const HEAT_RGB = "255, 196, 0";
// escala do mapa de calor: pouco dinheiro = roxo apagado → muito = amarelo forte
const LOW_RGB = [80, 50, 160];
const HIGH_RGB = [255, 210, 0];
const MIN_INTENSITY = 0.06; // abaixo disso (fração do percentil 98) a faixa não é desenhada

function heatColor(v) {
  const t = Math.min(1, v);
  const mix = (i) => Math.round(LOW_RGB[i] + (HIGH_RGB[i] - LOW_RGB[i]) * t);
  return `rgba(${mix(0)}, ${mix(1)}, ${mix(2)}, ${(0.12 + 0.78 * t ** 1.3).toFixed(3)})`;
}
const PROFILE_MAX_WIDTH = 150; // px (CSS)
const LABELS_PER_SIDE = 3;

// "≈ 100,6M" / "≈ 850K"
export function formatUsdShort(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(".", ",")}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
}

export class LiquidationOverlay {
  /** timeToX(ms) → coordenada x (CSS) do instante no eixo de tempo, ou null */
  constructor(timeToX) {
    this._timeToX = timeToX;
    this._data = null;
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

  /** data = resposta de /liquidation-map (available: true) ou null para esconder */
  setData(data) {
    if (data === this._data) return;
    this._data = data;
    // normaliza pelo percentil 98: um nível gigante não apaga todos os outros
    if (data?.segments.length) {
      const sorted = data.segments.map((s) => s.u).sort((a, b) => a - b);
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

  _draw(target) {
    const data = this._data;
    const series = this._series;
    if (!data || !series) return;

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
      for (const s of data.segments) {
        const yc = y(s.p);
        if (yc === null) continue;
        const x1 = this._timeToX(s.f);
        const x2 = s.t === null ? width / hr : this._timeToX(s.t);
        if (x2 === null || x2 < 0) continue;
        const left = Math.max(0, (x1 ?? 0) * hr);
        const right = Math.min(width, x2 * hr);
        if (right <= left) continue;
        const v = s.u / this._scale;
        if (v < MIN_INTENSITY) continue;
        const h = bandHeight(s.p);
        ctx.fillStyle = heatColor(v);
        ctx.fillRect(left, yc * vr - h / 2, right - left, h);
      }

      // perfil do que está pendente (só os níveis dentro da área visível)
      const visible = [];
      for (const l of data.levels) {
        const yc = y(l.price);
        if (yc === null || yc * vr < 0 || yc * vr > bitmapSize.height) continue;
        visible.push({ ...l, total: l.long + l.short, yc });
      }
      if (!visible.length) return;
      const maxTotal = Math.max(...visible.map((l) => l.total));
      const maxW = PROFILE_MAX_WIDTH * hr;
      for (const l of visible) {
        const w = (l.total / maxTotal) * maxW;
        const h = bandHeight(l.price);
        ctx.fillStyle = heatColor(l.total / maxTotal);
        ctx.fillRect(width - w, l.yc * vr - h / 2, w, h);
      }

      // valor das maiores concentrações acima e abaixo do preço
      ctx.font = `${Math.round(11 * vr)}px Manrope, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const used = []; // y dos rótulos já desenhados (não sobrepor níveis vizinhos)
      const label = (list) => {
        let count = 0;
        for (const l of [...list].sort((a, b) => b.total - a.total)) {
          if (count >= LABELS_PER_SIDE) break;
          if (used.some((uy) => Math.abs(uy - l.yc) < 18)) continue;
          used.push(l.yc);
          count++;
          const w = (l.total / maxTotal) * maxW;
          const text = `≈ ${formatUsdShort(l.total)}`;
          const x = width - w - 6 * hr;
          ctx.fillStyle = "rgba(11, 16, 36, 0.8)";
          const tw = ctx.measureText(text).width;
          ctx.fillRect(x - tw - 4 * hr, l.yc * vr - 8 * vr, tw + 8 * hr, 16 * vr);
          ctx.fillStyle = `rgb(${HEAT_RGB})`;
          ctx.fillText(text, x, l.yc * vr);
        }
      };
      label(visible.filter((l) => l.price > data.price));
      label(visible.filter((l) => l.price < data.price));
    });
  }
}

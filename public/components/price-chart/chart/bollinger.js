// Bandas de Bollinger: cálculo (média simples ± k desvios padrão dos fechamentos) e o preenchimento
// entre a banda superior e a inferior, desenhado como "primitive" do Lightweight Charts
// (a biblioteca não tem preenchimento entre duas linhas).

/**
 * Bandas alinhadas a `points` (null nas primeiras period-1 velas):
 * { basis, upper, lower }. Desvio padrão populacional, como no TradingView.
 */
export function bollinger(points, period, mult) {
  const n = points.length;
  const basis = new Array(n).fill(null);
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  if (period < 2 || n < period) return { basis, upper, lower };

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const c = points[i].close;
    sum += c;
    sumSq += c * c;
    if (i >= period) {
      const old = points[i - period].close;
      sum -= old;
      sumSq -= old * old;
    }
    if (i < period - 1) continue;
    const mean = sum / period;
    const sd = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    basis[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { basis, upper, lower };
}

/**
 * Preenchimento entre duas curvas. Anexar a uma série (series.attachPrimitive(fill)) e passar os dados
 * com setData(times, upper, lower, color), onde times[i] é o tempo da vela i no gráfico.
 */
export class BandFill {
  constructor() {
    this._times = [];
    this._upper = [];
    this._lower = [];
    this._color = "transparent";
    const self = this;
    this._view = {
      zOrder: () => "bottom",
      renderer: () => ({ draw: (target) => self._draw(target) }),
    };
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = this._series = this._requestUpdate = null;
  }

  setData(times, upper, lower, color) {
    this._times = times;
    this._upper = upper;
    this._lower = lower;
    this._color = color;
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return [this._view];
  }

  _draw(target) {
    if (!this._chart || !this._series || !this._times.length) return;
    const timeScale = this._chart.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (!range) return;
    // só as velas visíveis (o índice lógico é o índice da vela: a série principal tem todas)
    const from = Math.max(0, Math.floor(range.from) - 1);
    const to = Math.min(this._times.length - 1, Math.ceil(range.to) + 1);

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      ctx.fillStyle = this._color;
      // um polígono por trecho contínuo com valores (superior da esquerda p/ direita, inferior de volta)
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          ctx.beginPath();
          seg.forEach((p, i) => (i ? ctx.lineTo(p.x, p.yu) : ctx.moveTo(p.x, p.yu)));
          for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(seg[i].x, seg[i].yl);
          ctx.closePath();
          ctx.fill();
        }
        seg = [];
      };
      for (let i = from; i <= to; i++) {
        const u = this._upper[i];
        const l = this._lower[i];
        const x = u === null || l === null ? null : timeScale.timeToCoordinate(this._times[i]);
        const yu = x === null ? null : this._series.priceToCoordinate(u);
        const yl = x === null ? null : this._series.priceToCoordinate(l);
        if (x === null || yu === null || yl === null) {
          flush();
          continue;
        }
        seg.push({ x: x * hr, yu: yu * vr, yl: yl * vr });
      }
      flush();
    });
  }
}

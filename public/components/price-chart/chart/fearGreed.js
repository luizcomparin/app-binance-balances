// Crypto Fear & Greed Index (Alternative.me) no gráfico: nomes e cores das zonas e o encaixe do valor
// diário nas velas. O índice é do mercado (0 = medo extremo, 100 = ganância extrema), igual para todas as moedas.

// classificação informada pela API (campo c de /fear-greed) → nome e cor
export const FNG_CLASSES = {
  "extreme-fear": { label: "Medo extremo", color: "#ff5c5c" },
  fear: { label: "Medo", color: "#ff9f5a" },
  neutral: { label: "Neutro", color: "#ffd166" },
  greed: { label: "Ganância", color: "#9be06f" },
  "extreme-greed": { label: "Ganância extrema", color: "#52ffa8" },
};
const UNKNOWN_CLASS = { label: "", color: "#9bb0d6" };

/** nome e cor de uma classificação; desconhecida ou ausente: sem nome, cor neutra */
export function fearGreedClass(c) {
  return FNG_CLASSES[c] || UNKNOWN_CLASS;
}

// Faixas das zonas no painel (0 a 100). Os limites são os que o histórico da Alternative.me mostra (medo
// extremo até 25, medo 26–46, neutro 47–54, ganância 55–75, ganância extrema de 76 em diante), postos
// entre um inteiro e o seguinte. A zona de cada dia (cor da linha e título) continua vindo da API.
export const FNG_BANDS = [
  { key: "extreme-fear", from: 0, to: 25.5, shaded: true },
  { key: "fear", from: 25.5, to: 46.5 },
  { key: "neutral", from: 46.5, to: 54.5 },
  { key: "greed", from: 54.5, to: 75.5 },
  { key: "extreme-greed", from: 75.5, to: 100, shaded: true },
];

const hexToRgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * Fundo do painel dividido nas 5 zonas, desenhado como "primitive" do Lightweight Charts (anexar à série do
 * índice: series.attachPrimitive(zones)): os dois extremos com fundo na cor da zona, meio transparente, até
 * a borda do painel; linhas pontilhadas entre as zonas; e o nome de cada uma à direita (só onde cabe).
 */
export class FearGreedZones {
  constructor() {
    const self = this;
    this._view = {
      zOrder: () => "bottom",
      renderer: () => ({ draw: (target) => self._draw(target) }),
    };
  }

  attached({ series }) {
    this._series = series;
  }

  detached() {
    this._series = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._view];
  }

  _draw(target) {
    const series = this._series;
    if (!series) return;
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const { width, height } = bitmapSize;
      const y = (v) => {
        const c = series.priceToCoordinate(v);
        return c === null ? null : c * vr;
      };
      ctx.save();
      for (const band of FNG_BANDS) {
        // (o eixo cresce para cima: o limite de cima da faixa tem o y menor)
        let top = y(band.to);
        let bottom = y(band.from);
        if (top === null || bottom === null) continue;
        const { label, color } = fearGreedClass(band.key);
        if (band.shaded) {
          // os extremos vão até a borda do painel (cobrem a margem acima de 100 e abaixo de 0)
          if (band.to >= 100) top = 0;
          if (band.from <= 0) bottom = height;
          ctx.fillStyle = hexToRgba(color, 0.12);
          ctx.fillRect(0, top, width, bottom - top);
        }
        // linha pontilhada no limite de cima de cada faixa, menos a última (4 linhas entre as 5 zonas)
        if (band.to < 100) {
          const lineY = Math.round(y(band.to)) + 0.5;
          ctx.strokeStyle = "rgba(155, 176, 214, 0.35)";
          ctx.lineWidth = Math.max(1, Math.round(vr));
          ctx.setLineDash([2 * hr, 3 * hr]);
          ctx.beginPath();
          ctx.moveTo(0, lineY);
          ctx.lineTo(width, lineY);
          ctx.stroke();
        }
        // nome da zona à direita, no meio da faixa (não desenha onde a faixa é mais baixa que o texto)
        const bandTop = y(band.to);
        const bandBottom = y(band.from);
        if (bandBottom - bandTop < 10 * vr) continue;
        ctx.font = `${Math.round(10 * vr)}px Manrope, sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(200, 212, 240, 0.7)";
        ctx.fillText(label, width - 8 * hr, (bandTop + bandBottom) / 2);
      }
      ctx.restore();
    });
  }
}

// o valor do dia vale até sair o próximo; sem valor novo há mais que isso, a fonte parou: não repete
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Encaixa o índice diário (rows = [{ t, v, c }], em ordem de tempo) nas velas (points = [{ time }]).
 * Cada vela fica com o último valor publicado até o fim dela: em vela diária é o do dia; em semanal e
 * mensal, o do último dia da vela; em 1h/4h, o do dia se repete. Dia sem valor repete o anterior.
 * Devolve { values, classes } alinhados às velas (null antes do primeiro valor ou com a fonte parada).
 */
export function alignFearGreed(points, rows) {
  const n = points?.length || 0;
  const values = new Array(n).fill(null);
  const classes = new Array(n).fill(null);
  if (!n || !rows?.length) return { values, classes };
  const lastT = rows.at(-1).t;
  let next = 0;
  let cur = null;
  for (let i = 0; i < n; i++) {
    const end = i + 1 < n ? points[i + 1].time : Infinity;
    while (next < rows.length && rows[next].t < end) cur = rows[next++];
    if (!cur || points[i].time - lastT > STALE_MS) continue;
    values[i] = cur.v;
    classes[i] = cur.c;
  }
  return { values, classes };
}

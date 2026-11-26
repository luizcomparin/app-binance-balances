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

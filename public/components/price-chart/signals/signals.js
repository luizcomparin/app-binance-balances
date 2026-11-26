// Sinais de compra e venda: núcleo puro (sem DOM, sem rede e sem ler o "agora" por conta própria).
// Lê as velas diárias e semanais de uma moeda (mais o Fear & Greed Index do mercado e, se houver, o funding
// e as liquidações reais dos futuros) e devolve a tendência, a região (sobrevendido, fundo provável, sobrecomprado ou neutra) e a lista de sinais. Não é previsão. Documentação: docs/sinais/.
//
// Vela em andamento: o valor e o estado "ativo" de cada sinal usam a última vela (mesmo em formação);
// "há N velas" (`bars`) conta só velas FECHADAS seguidas. Ativo com bars = 0 fica `forming: true`.
// Para calcular uma data passada (backtest), passe as velas até ela e `now` no fim da última vela.

import { movingAverage } from "../chart/movingAverage.js";
import { rsi } from "../chart/rsi.js";
import { macd, MACD_DEFAULT, macdHistogramTones } from "../chart/macd.js";
import { formatPrice, formatUsdShort } from "../../../core/format.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Limiares fixos da v1 (ver docs/sinais/catalogo-de-sinais.md)
export const SIGNAL_DEFAULTS = {
  // divPivot: velas de cada lado para um fundo/topo contar como pivô; divMaxGap: distância máxima entre os
  // dois pivôs comparados; divRecent: idade máxima do 2º pivô para a divergência ainda valer (em velas)
  d: { ms: DAY_MS, maShort: 50, maLong: 200, stretchMa: 200, minSamples: 365, divPivot: 5, divMaxGap: 60, divRecent: 20 },
  w: { ms: 7 * DAY_MS, maShort: 20, maLong: 50, stretchMa: 50, minSamples: 52, divPivot: 3, divMaxGap: 26, divRecent: 8 },
  slopeBars: 10, // inclinação da média longa: valor atual × o de N velas atrás
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  divRsiLow: 40, // divergência de alta: o RSI do 1º fundo precisa estar até aqui (região fraca)
  divRsiHigh: 60, // divergência de baixa: o RSI do 1º topo precisa estar a partir daqui (região forte)
  stretchLow: 10, // percentil da esticagem que conta como fundo
  stretchHigh: 90, // ... e como topo
  macd: { fast: MACD_DEFAULT.fast, slow: MACD_DEFAULT.slow, signal: MACD_DEFAULT.signal, oscType: "EMA", signalType: "EMA" },
  macdCrossBars: 3, // cruzamento do MACD com o sinal: avisa se foi nas últimas N velas
  fngFear: 25, // Fear & Greed até aqui = medo extremo (fundo); é a zona da própria Alternative.me
  fngGreed: 76, // ... e a partir daqui = ganância extrema (topo)
  fngStaleMs: 2 * DAY_MS, // último valor mais velho que isso: a fonte parou
  fundingDays: 7, // funding: média das taxas dos últimos N dias
  fundingMinDays: 60, // ... comparada com o histórico da moeda, que precisa cobrir ao menos isto
  fundingLow: 10, // percentil que conta como fundo (com a média negativa)
  fundingHigh: 90, // ... e como topo (com a média positiva)
  fundingStaleMs: 2 * DAY_MS,
  liqDays: 7, // liquidações: soma dos últimos N dias, por lado
  liqLookbackDays: 730, // ... comparada com as janelas dos últimos 2 anos (o mercado cresce: histórico antigo distorce)
  liqMinDays: 180, // histórico mínimo para comparar
  liqHigh: 90, // percentil que conta como cascata
  regionMin: 3, // famílias de sinais do lado dominante para a região ("sobrevendido" / "sobrecomprado")
  regionMaxOpposite: 1, // ... com no máximo estas do lado oposto
  // região de fundo com um destes sinais ativo sobe de nível: "fundo provável" (o RSI semanal a favor foi o
  // que mais se sustentou no histórico; ver docs/sinais/calibracao.md)
  strongBottomIds: ["rsi-w", "rsi-div-w"],
};

// Famílias dos sinais de fundo/topo: sinais que medem a mesma coisa (o RSI diário e o semanal, por exemplo)
// costumam acender juntos, então o placar conta cada família uma vez só.
export const SIGNAL_FAMILIES = [
  { key: "rsi", label: "RSI", ids: ["rsi-d", "rsi-w"] },
  { key: "div", label: "Divergência de RSI", ids: ["rsi-div-d", "rsi-div-w"] },
  { key: "stretch", label: "Esticagem da média", ids: ["stretch-d", "stretch-w"] },
  { key: "sentiment", label: "Sentimento do mercado", ids: ["fng"] },
  { key: "futures", label: "Futuros", ids: ["funding", "liq"] },
];
const familyOf = (id) => SIGNAL_FAMILIES.find((f) => f.ids.includes(id))?.key ?? null;

const TF_LABEL = { d: "diário", w: "semanal" };
const TF_LABEL_FEM = { d: "diária", w: "semanal" }; // "tendência diária", "SMA 200 diária"
const BAR_UNIT = { d: ["dia", "dias"], w: ["semana", "semanas"] };

const num = (v, digits = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signedPct = (v) => `${v > 0 ? "+" : ""}${num(v)}%`;
const barsText = (n, tf) => `${n} ${BAR_UNIT[tf][n === 1 ? 0 : 1]}`;
// "há 3 dias" ou, se só a vela em andamento está na zona, "na vela em formação"
const sinceText = (bars, tf) => (bars > 0 ? `há ${barsText(bars, tf)}` : "na vela em formação");

/** Índice da última vela fechada: a última vela só conta como fechada se já terminou em `now`. -1 = nenhuma. */
export function lastClosedIndex(points, barMs, now) {
  const n = points?.length || 0;
  if (!n) return -1;
  return points[n - 1].time + barMs <= now ? n - 1 : n - 2;
}

/** Quantos valores seguidos, terminando em `end` e andando para trás, satisfazem `test` (null interrompe). */
export function streak(values, end, test) {
  let count = 0;
  for (let i = end; i >= 0 && values[i] !== null && values[i] !== undefined && test(values[i]); i--) count++;
  return count;
}

/**
 * Percentil (0–100) de `value` numa amostra ORDENADA: a parte da amostra que fica abaixo dele
 * (inclusive: abaixo ou igual). Amostra vazia: null.
 */
export function percentileRank(sorted, value, inclusive = false) {
  if (!sorted?.length) return null;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (inclusive ? sorted[mid] <= value : sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return (lo / sorted.length) * 100;
}

/**
 * Percentil com os empates divididos ao meio (média do estrito com o inclusivo). É o que decide se um valor
 * é extremo: uma série parada num valor só fica em 50 (não é extremo), e um valor que empata com o máximo
 * (ex.: funding travado no teto por vários dias) continua perto de 100.
 */
export function midRank(sorted, value) {
  if (!sorted?.length) return null;
  return (percentileRank(sorted, value) + percentileRank(sorted, value, true)) / 2;
}

const unavailable = (id, group, timeframe, reason, text) => ({
  id, group, timeframe, available: false, reason, active: false, side: null, value: null, bars: 0, forming: false, text,
});

/**
 * Tendência por médias: alta com o fechamento acima das duas médias e a curta acima da longa;
 * baixa com o inverso; qualquer outra combinação é lateral.
 */
export function trendSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const { ms, maShort, maLong } = cfg[tf];
  const id = `trend-ma-${tf}`;
  const n = points?.length || 0;
  const short = movingAverage(points || [], maShort);
  const long = movingAverage(points || [], maLong);
  if (!n || long[n - 1] === null) {
    return unavailable(id, "trend", tf, "history", `Tendência ${TF_LABEL_FEM[tf]}: histórico insuficiente para a SMA ${maLong}`);
  }

  const stateAt = (i) => {
    if (long[i] === null || short[i] === null) return null;
    const c = points[i].close;
    if (c > short[i] && c > long[i] && short[i] > long[i]) return "up";
    if (c < short[i] && c < long[i] && short[i] < long[i]) return "down";
    return "side";
  };
  const states = points.map((_, i) => stateAt(i));
  const side = states[n - 1];
  const bars = streak(states, lastClosedIndex(points, ms, now), (s) => s === side);

  const back = long[n - 1 - cfg.slopeBars];
  const slope = back ? (long[n - 1] / back - 1) * 100 : null;
  const name = { up: "alta", down: "baixa", side: "lateral" }[side];
  const slopeText = slope === null ? "" : `; SMA ${maLong} ${slope >= 0 ? "subindo" : "caindo"} (${signedPct(slope)} em ${cfg.slopeBars} velas)`;

  return {
    id, group: "trend", timeframe: tf, available: true,
    active: side !== "side", side, value: null, bars, forming: bars === 0,
    details: { close: points[n - 1].close, maShort: short[n - 1], maLong: long[n - 1], slope, periods: [maShort, maLong] },
    text: `Tendência ${TF_LABEL_FEM[tf]}: ${name} ${sinceText(bars, tf)} (preço × SMA ${maShort} e SMA ${maLong})${slopeText}`,
  };
}

/** RSI em sobrevenda (fundo) ou sobrecompra (topo). */
export function rsiSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const id = `rsi-${tf}`;
  const n = points?.length || 0;
  const values = rsi(points, cfg.rsiPeriod);
  const value = n ? values[n - 1] : null;
  if (value === null) {
    return unavailable(id, "extreme", tf, "history", `RSI ${TF_LABEL[tf]}: histórico insuficiente`);
  }

  const zone = (v) => (v <= cfg.rsiOversold ? "bottom" : v >= cfg.rsiOverbought ? "top" : null);
  const side = zone(value);
  const bars = side ? streak(values, lastClosedIndex(points, cfg[tf].ms, now), (v) => zone(v) === side) : 0;
  const label = `RSI ${cfg.rsiPeriod} ${TF_LABEL[tf]} em ${num(value)}`;

  return {
    id, group: "extreme", timeframe: tf, available: true,
    active: !!side, side, value, bars, forming: !!side && bars === 0,
    text: side ? `${label}: ${side === "bottom" ? "sobrevendido" : "sobrecomprado"} ${sinceText(bars, tf)}` : `${label}: neutro`,
  };
}

/**
 * Divergência entre o preço e o RSI, nos dois últimos fundos (ou topos) confirmados:
 * - de alta (fundo): o preço faz um fundo mais baixo que o anterior, mas o RSI faz um fundo mais alto;
 * - de baixa (topo): o preço faz um topo mais alto, mas o RSI faz um topo mais baixo.
 * Fundo/topo confirmado (pivô) = mínima/máxima da vela é o extremo entre `divPivot` velas de cada lado,
 * todas fechadas: a divergência só aparece `divPivot` velas depois do 2º pivô. Deixa de valer quando o
 * 2º pivô fica velho (`divRecent`) ou quando o preço passa dele (nova mínima ou nova máxima).
 */
export function rsiDivergenceSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const { ms, divPivot: k, divMaxGap, divRecent } = cfg[tf];
  const id = `rsi-div-${tf}`;
  const name = `Divergência no RSI ${TF_LABEL[tf]}`;
  const n = points?.length || 0;
  const closed = lastClosedIndex(points, ms, now);
  if (closed < cfg.rsiPeriod + 2 * k) return unavailable(id, "extreme", tf, "history", `${name}: histórico insuficiente`);

  const values = rsi(points, cfg.rsiPeriod);
  // kind "low": fundos pela mínima; "high": topos pela máxima (sem mínima/máxima na vela, usa o fechamento)
  const find = (kind) => {
    const price = (i) => points[i][kind] ?? points[i].close;
    const beats = (a, b) => (kind === "low" ? a < b : a > b);
    const isPivot = (i) => {
      if (values[i] === null) return false;
      // extremo entre as k velas de cada lado (empate: vale a primeira vela)
      for (let j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (j < i ? !beats(price(i), price(j)) : beats(price(j), price(i))) return false;
      }
      return true;
    };
    // só os dois pivôs mais recentes, procurando de trás para frente
    const pivots = [];
    for (let i = closed - k; i >= k && pivots.length < 2; i--) if (isPivot(i)) pivots.push(i);
    if (pivots.length < 2) return null;
    const [b, a] = pivots; // a = 1º (mais antigo), b = 2º
    if (closed - b > divRecent || b - a > divMaxGap) return null;
    // preço mais extremo no 2º pivô e RSI menos extremo; o 1º precisa ter acontecido com o RSI já fraco/forte
    if (!beats(price(b), price(a)) || !beats(values[a], values[b])) return null;
    if (kind === "low" ? values[a] > cfg.divRsiLow : values[a] < cfg.divRsiHigh) return null;
    // depois do 2º pivô (inclusive na vela em formação) o preço não pode ter passado dele
    for (let j = b + 1; j < n; j++) if (beats(price(j), price(b))) return null;
    const at = (i) => ({ time: points[i].time, price: price(i), rsi: values[i] });
    return { side: kind === "low" ? "bottom" : "top", index: b, first: at(a), second: at(b) };
  };

  // as duas ao mesmo tempo é raro: vale a do 2º pivô mais recente
  const found = [find("low"), find("high")].filter(Boolean).sort((x, y) => y.index - x.index)[0];
  if (!found) {
    return {
      id, group: "extreme", timeframe: tf, available: true,
      active: false, side: null, value: null, bars: 0, forming: false,
      text: `${name}: nenhuma recente`,
    };
  }

  const { side, first, second } = found;
  const bars = closed - found.index;
  const what = side === "bottom" ? "fundo" : "topo";
  const move = `preço fez ${what} mais ${side === "bottom" ? "baixo" : "alto"} (${formatPrice(first.price)} → ${formatPrice(second.price)})`;
  const osc = `o RSI, ${what} mais ${side === "bottom" ? "alto" : "baixo"} (${num(first.rsi)} → ${num(second.rsi)})`;
  return {
    id, group: "extreme", timeframe: tf, available: true,
    active: true, side, value: second.rsi, bars, forming: false,
    details: { first, second },
    text: `${name}: de ${side === "bottom" ? "alta" : "baixa"}; ${move} e ${osc}; 2º ${what} há ${barsText(bars, tf)}`,
  };
}

/**
 * Esticagem: distância do fechamento até a média (em %), comparada com o histórico da própria moeda.
 * Fundo: abaixo da média e entre os valores mais baixos do histórico; topo: acima da média e entre os mais altos.
 * A amostra são as velas fechadas; a vela em formação é só comparada com ela.
 */
export function stretchSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const { ms, stretchMa, minSamples } = cfg[tf];
  const id = `stretch-${tf}`;
  const n = points?.length || 0;
  const ma = movingAverage(points || [], stretchMa);
  const values = ma.map((m, i) => (m ? (points[i].close / m - 1) * 100 : null));
  const closed = lastClosedIndex(points, ms, now);
  const sample = values.slice(0, closed + 1).filter((v) => v !== null);
  const value = n ? values[n - 1] : null;
  if (value === null || sample.length < minSamples) {
    return unavailable(id, "extreme", tf, "history", `Esticagem da SMA ${stretchMa} ${TF_LABEL_FEM[tf]}: histórico insuficiente para comparar`);
  }

  const sorted = sample.slice().sort((a, b) => a - b);
  const zone = (v) => {
    const p = midRank(sorted, v);
    if (v < 0 && p <= cfg.stretchLow) return "bottom";
    if (v > 0 && p >= cfg.stretchHigh) return "top";
    return null;
  };
  const side = zone(value);
  const bars = side ? streak(values, closed, (v) => zone(v) === side) : 0;
  const percentile = percentileRank(sorted, value);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const where = `Preço ${signedPct(value)} da SMA ${stretchMa} ${TF_LABEL_FEM[tf]}`;
  // arredonda para baixo: "acima de 100%" só quando passa mesmo de todo o histórico
  const history = `acima de ${Math.floor(percentile)}% do histórico (extremos: ${signedPct(min)} e ${signedPct(max)})`;

  return {
    id, group: "extreme", timeframe: tf, available: true,
    active: !!side, side, value, bars, forming: !!side && bars === 0, percentile,
    details: { ma: ma[n - 1], period: stretchMa, min, max, samples: sorted.length },
    text: side
      ? `${where}: muito ${side === "bottom" ? "abaixo" : "acima"} da média ${sinceText(bars, tf)}, ${history}`
      : `${where}: ${history}`,
  };
}

/**
 * MACD: acima de zero favorece alta, abaixo favorece baixa. Avisa o cruzamento recente com a linha de
 * sinal (o histograma trocou de lado) e o histograma perdendo força (barras voltando em direção ao zero).
 */
export function macdSignal(points, tf, now, cfg = SIGNAL_DEFAULTS) {
  const id = `macd-${tf}`;
  const n = points?.length || 0;
  const { macd: line, hist } = macd(points, cfg.macd);
  const value = n ? line[n - 1] : null;
  const name = `MACD ${TF_LABEL[tf]} (${cfg.macd.fast}/${cfg.macd.slow}/${cfg.macd.signal})`;
  if (value === null || hist[n - 1] === null) {
    return unavailable(id, "trend", tf, "history", `${name}: histórico insuficiente`);
  }

  const sideOf = (v) => (v > 0 ? "up" : v < 0 ? "down" : null);
  const side = sideOf(value);
  const bars = side ? streak(line, lastClosedIndex(points, cfg[tf].ms, now), (v) => sideOf(v) === side) : 0;

  // cruzamento: a vela mais recente (até N atrás) em que o histograma trocou de lado
  let cross = null;
  for (let ago = 0; ago < cfg.macdCrossBars && !cross; ago++) {
    const i = n - 1 - ago;
    const prev = hist[i - 1];
    if (prev === null || prev === undefined) break;
    if (hist[i] > 0 && prev <= 0) cross = { dir: "up", barsAgo: ago };
    else if (hist[i] < 0 && prev >= 0) cross = { dir: "down", barsAgo: ago };
  }
  const weakening = !macdHistogramTones(hist)[n - 1].strong;

  const parts = [];
  if (side) parts.push(`${side === "up" ? "acima" : "abaixo"} de zero ${sinceText(bars, tf)} (favorece ${side === "up" ? "alta" : "baixa"})`);
  else parts.push("em zero");
  if (cross) {
    const when = cross.barsAgo === 0 ? "na última vela" : `há ${cross.barsAgo} ${cross.barsAgo === 1 ? "vela" : "velas"}`;
    parts.push(`cruzou o sinal para ${cross.dir === "up" ? "cima" : "baixo"} ${when}`);
  }
  if (weakening) parts.push("histograma perdendo força");

  return {
    id, group: "trend", timeframe: tf, available: true,
    active: !!side, side, value, bars, forming: !!side && bars === 0,
    details: { hist: hist[n - 1], cross, weakening },
    text: `${name}: ${parts.join("; ")}`,
  };
}

/**
 * Fear & Greed Index (do mercado, igual para toda moeda): medo extremo conta como sinal de fundo e
 * ganância extrema, de topo. rows = [{ t (ms), v (0–100) }] em ordem de tempo, um valor por dia.
 * O valor do dia já sai fechado: aqui não existe "vela em formação".
 */
export function fearGreedSignal(rows, now, cfg = SIGNAL_DEFAULTS) {
  const none = (reason, why) => unavailable("fng", "extreme", null, reason, `Fear & Greed: ${why}`);
  const list = (rows || []).filter((r) => r.t <= now);
  if (!list.length) return none("no-data", "sem dados da fonte");
  const last = list[list.length - 1];
  if (now - last.t > cfg.fngStaleMs) return none("stale", "a fonte está sem valores novos");

  const zone = (v) => (v <= cfg.fngFear ? "bottom" : v >= cfg.fngGreed ? "top" : null);
  const side = zone(last.v);
  const bars = side ? streak(list.map((r) => r.v), list.length - 1, (v) => zone(v) === side) : 0;
  const label = `Fear & Greed em ${last.v}`;

  return {
    id: "fng", group: "extreme", timeframe: null, available: true,
    active: !!side, side, value: last.v, bars, forming: false,
    text: side
      ? `${label}: ${side === "bottom" ? "medo extremo" : "ganância extrema"} há ${barsText(bars, "d")} (índice do mercado)`
      : `${label}: sem extremo (índice do mercado; medo extremo até ${cfg.fngFear}, ganância extrema a partir de ${cfg.fngGreed})`,
  };
}

// Fontes opcionais (funding, liquidações): chegam como { rows } ou { reason } (por que não há dados)
const SOURCE_PROBLEMS = {
  "no-perpetual": "a moeda não tem contrato perpétuo",
  "no-market": "a moeda não tem contrato perpétuo nas corretoras",
  "no-key": "configure a chave da Coinalyze nas Configurações",
  "invalid-key": "a chave da Coinalyze foi recusada",
  history: "histórico insuficiente para comparar",
  stale: "a fonte está sem valores novos",
};
const sourceProblem = (reason) => SOURCE_PROBLEMS[reason] || "fonte indisponível no momento";

/**
 * Funding dos futuros perpétuos: média das taxas dos últimos dias, comparada com o histórico da moeda.
 * Negativa e entre as mais baixas (shorts pagando para ficar vendidos) conta como fundo; positiva e entre
 * as mais altas (longs pagando caro), como topo. source = { rows: [{ t (ms), r (taxa) }] } ou { reason }.
 */
export function fundingSignal(source, now, cfg = SIGNAL_DEFAULTS) {
  const none = (reason) => unavailable("funding", "extreme", null, reason, `Funding: ${sourceProblem(reason)}`);
  if (!source?.rows) return none(source?.reason || "no-data");
  const rows = source.rows.filter((r) => r.t <= now && Number.isFinite(r.r));
  if (!rows.length) return none("no-data");
  const first = rows[0].t;
  const last = rows[rows.length - 1].t;
  if (now - last > cfg.fundingStaleMs) return none("stale");
  if (last - first < cfg.fundingMinDays * DAY_MS) return none("history");

  const span = cfg.fundingDays * DAY_MS;
  // média das taxas cobradas na janela (end − span, end]
  const meanAt = (end) => {
    let sum = 0;
    let count = 0;
    for (let i = rows.length - 1; i >= 0 && rows[i].t > end - span; i--) {
      if (rows[i].t > end) continue;
      sum += rows[i].r;
      count++;
    }
    return count ? sum / count : null;
  };
  // amostra: a média da janela que termina em cada cobrança, desde que a janela caiba no histórico
  const sorted = rows.filter((r) => r.t - first >= span).map((r) => meanAt(r.t)).sort((a, b) => a - b);
  const zone = (mean) => {
    if (mean === null) return null;
    const p = midRank(sorted, mean);
    if (mean < 0 && p <= cfg.fundingLow) return "bottom";
    if (mean > 0 && p >= cfg.fundingHigh) return "top";
    return null;
  };

  const value = meanAt(now);
  if (value === null) return none("stale");
  const side = zone(value);
  // há quantos dias seguidos a média de 7 dias está na zona (janelas terminando hoje, ontem, anteontem...)
  let bars = 0;
  if (side) while (now - bars * DAY_MS - span >= first && zone(meanAt(now - bars * DAY_MS)) === side) bars++;
  const percentile = percentileRank(sorted, value);
  const days = Math.round((last - first) / DAY_MS);
  const pct = `${value > 0 ? "+" : ""}${num(value * 100, 4)}%`;
  const where = `Funding médio de ${cfg.fundingDays} dias em ${pct} por cobrança`;
  const history = `acima de ${Math.floor(percentile)}% dos últimos ${days} dias`;

  return {
    id: "funding", group: "extreme", timeframe: null, available: true,
    active: !!side, side, value, bars, forming: false, percentile,
    details: { days, samples: sorted.length, min: sorted[0], max: sorted[sorted.length - 1] },
    text: side
      ? `${where}: ${side === "bottom" ? "negativo e entre os mais baixos" : "entre os mais altos"} há ${barsText(bars, "d")}, ${history}`
      : `${where}: ${history}`,
  };
}

/**
 * Liquidações reais dos futuros: soma dos últimos dias, por lado, comparada com as mesmas janelas dos
 * últimos 2 anos da própria moeda. Cascata de longs (vendas forçadas) conta como fundo; de shorts (compras
 * forçadas), como topo. source = { rows: [{ t (ms, início do dia UTC), long, short (US$) }] } ou { reason };
 * dia sem linha vale zero (a fonte omite os dias zerados).
 */
export function liquidationSignal(source, now, cfg = SIGNAL_DEFAULTS) {
  const none = (reason) => unavailable("liq", "extreme", null, reason, `Liquidações: ${sourceProblem(reason)}`);
  if (!source?.rows) return none(source?.reason || "no-data");
  const rows = source.rows.filter((r) => r.t <= now);
  if (!rows.length) return none("no-data");

  const dayOf = (t) => Math.floor(t / DAY_MS);
  const today = dayOf(now);
  const start = Math.max(dayOf(rows[0].t), today - cfg.liqLookbackDays);
  const size = today - start + 1;
  const daily = { long: new Array(size).fill(0), short: new Array(size).fill(0) };
  for (const r of rows) {
    const i = dayOf(r.t) - start;
    if (i < 0) continue;
    daily.long[i] += r.long || 0;
    daily.short[i] += r.short || 0;
  }
  // soma móvel de N dias terminando em cada dia (null enquanto a janela não cabe)
  const rolling = (values) => {
    const out = new Array(size).fill(null);
    let sum = 0;
    for (let i = 0; i < size; i++) {
      sum += values[i] - (i >= cfg.liqDays ? values[i - cfg.liqDays] : 0);
      if (i >= cfg.liqDays - 1) out[i] = sum;
    }
    return out;
  };
  const sums = { long: rolling(daily.long), short: rolling(daily.short) };
  // amostra: as janelas que terminam em dias já fechados (a de hoje é só comparada com elas)
  const sample = (side) => sums[side].slice(0, size - 1).filter((v) => v !== null).sort((a, b) => a - b);
  const sorted = { long: sample("long"), short: sample("short") };
  if (sorted.long.length < cfg.liqMinDays) return none("history");

  const rankAt = (i) => ({ long: midRank(sorted.long, sums.long[i]), short: midRank(sorted.short, sums.short[i]) });
  // longs liquidados em cascata = fundo; shorts = topo; os dois ao mesmo tempo: vale o mais extremo
  const zoneAt = (i) => {
    if (sums.long[i] === null) return null;
    const p = rankAt(i);
    const long = p.long >= cfg.liqHigh && sums.long[i] > 0;
    const short = p.short >= cfg.liqHigh && sums.short[i] > 0;
    if (long && short) return p.long > p.short || (p.long === p.short && sums.long[i] >= sums.short[i]) ? "bottom" : "top";
    return long ? "bottom" : short ? "top" : null;
  };

  const cur = size - 1;
  const side = zoneAt(cur);
  let bars = 0;
  if (side) while (cur - bars >= 0 && zoneAt(cur - bars) === side) bars++;
  // no texto e em `percentile`: a parte do histórico que fica abaixo do valor de hoje
  const p = { long: percentileRank(sorted.long, sums.long[cur]), short: percentileRank(sorted.short, sums.short[cur]) };
  const part = (name, key) => `${formatUsdShort(sums[key][cur])} em ${name} (acima de ${Math.floor(p[key])}% do histórico)`;
  const where = `Liquidações em ${cfg.liqDays} dias: ${part("longs", "long")} e ${part("shorts", "short")}`;

  return {
    id: "liq", group: "extreme", timeframe: null, available: true,
    active: !!side, side, value: side === "top" ? sums.short[cur] : sums.long[cur], bars, forming: false,
    percentile: side === "top" ? p.short : p.long,
    details: { long: sums.long[cur], short: sums.short[cur], longPercentile: p.long, shortPercentile: p.short, samples: sorted.long.length },
    text: side ? `${where}: cascata de ${side === "bottom" ? "longs" : "shorts"} há ${barsText(bars, "d")}` : where,
  };
}

/**
 * Placar de confluência dos sinais do grupo "extreme" (fundo/topo), contado por FAMÍLIA: uma família conta
 * para um lado quando ao menos um dos seus sinais disponíveis está ativo nesse lado. Sinal sem família
 * (`family` ausente) conta como uma família só dele.
 * Devolve { side, strong, bottom, top, of } em famílias (of = famílias com algum sinal disponível) e
 * signals: { bottom, top, of } com a contagem sinal a sinal.
 * strong: a região é de fundo E um dos sinais de `strongBottomIds` (RSI semanal sobrevendido ou divergência de
 * alta semanal) está ativo. Na tela: região de fundo = "Sobrevendido"; com strong = "Fundo provável".
 */
export function regionOf(signals, cfg = SIGNAL_DEFAULTS) {
  const usable = signals.filter((s) => s.group === "extreme" && s.available);
  const count = (side) => usable.filter((s) => s.active && s.side === side);
  const families = (list) => new Set(list.map((s) => s.family ?? s.id ?? s)).size;
  const bottom = families(count("bottom"));
  const top = families(count("top"));
  const wins = (a, b) => a >= cfg.regionMin && b <= cfg.regionMaxOpposite;
  const side = wins(bottom, top) ? "bottom" : wins(top, bottom) ? "top" : "neutral";
  const strong = side === "bottom" && count("bottom").some((s) => cfg.strongBottomIds.includes(s.id));
  return {
    side, strong, bottom, top, of: families(usable),
    signals: { bottom: count("bottom").length, top: count("top").length, of: usable.length },
  };
}

/**
 * Análise completa de uma moeda.
 * daily / weekly: velas [{ time (ms da abertura), close, ... }] em ordem crescente; now: instante da análise (ms).
 * fearGreed: linhas do Fear & Greed Index ([{ t, v }]) ou null se a fonte não respondeu.
 * funding / liquidations: fontes opcionais dos futuros, { rows } ou { reason } (ver fundingSignal e liquidationSignal).
 * Devolve { asset, generatedAt, trend: { d, w }, region, signals } (serializável em JSON). Cada sinal sai
 * com `family` (a família dele no placar; null nos de tendência).
 */
export function analyzeSignals({ asset, daily, weekly, fearGreed, funding, liquidations, now }, cfg = SIGNAL_DEFAULTS) {
  const series = { d: daily || [], w: weekly || [] };
  const signals = [];
  for (const tf of ["d", "w"]) signals.push(trendSignal(series[tf], tf, now, cfg));
  for (const tf of ["d", "w"]) signals.push(macdSignal(series[tf], tf, now, cfg));
  for (const tf of ["d", "w"]) signals.push(rsiSignal(series[tf], tf, now, cfg));
  for (const tf of ["d", "w"]) signals.push(rsiDivergenceSignal(series[tf], tf, now, cfg));
  for (const tf of ["d", "w"]) signals.push(stretchSignal(series[tf], tf, now, cfg));
  signals.push(fearGreedSignal(fearGreed, now, cfg));
  signals.push(fundingSignal(funding, now, cfg));
  signals.push(liquidationSignal(liquidations, now, cfg));
  for (const s of signals) s.family = familyOf(s.id);

  const trendOf = (tf) => {
    const s = signals.find((x) => x.id === `trend-ma-${tf}`);
    return s.available ? s.side : null;
  };
  return {
    asset,
    generatedAt: now,
    trend: { d: trendOf("d"), w: trendOf("w") },
    region: regionOf(signals, cfg),
    signals,
  };
}

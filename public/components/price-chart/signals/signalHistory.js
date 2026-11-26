// "O que aconteceu depois": percorre o passado da moeda dia a dia, calcula os sinais de fundo/topo como
// seriam vistos em cada dia (só com o que existia até ele, sem dado do futuro) e mede o que o preço fez
// depois de cada vez que um sinal ativou. Puro: sem DOM e sem rede. Documentação: docs/sinais/.
//
// Não é previsão: são poucas ocorrências por moeda, e o passado não garante o futuro.

import {
  fearGreedSignal, fundingSignal, liquidationSignal, regionOf, rsiDivergenceSignal, rsiSignal, SIGNAL_DEFAULTS, SIGNAL_FAMILIES,
  stretchSignal,
} from "./signals.js";

// chaves do placar no histórico, ao lado dos ids dos sinais: a região (sobrevendido ou sobrecomprado) e o
// nível forte da região de fundo ("fundo provável")
export const REGION_KEY = "region";
export const STRONG_KEY = "region-strong";

const DAY_MS = 24 * 60 * 60 * 1000;

export const HISTORY_DEFAULTS = {
  horizons: [30, 90], // dias depois da ativação em que o preço é comparado
  minGapDays: 14, // o sinal precisa ter ficado apagado mais que isso para contar como uma nova vez
  firstDay: 60, // primeiro dia avaliado (antes disso nem o RSI semanal existe)
  minEpisodes: 5, // abaixo disso a janela avisa que é pouco para concluir
  sliceMs: 12, // tempo de trabalho antes de devolver o controle à página (a conta leva alguns segundos)
};

/**
 * Velas semanais como estavam no fim do dia `i` de `daily`: só as que já tinham começado, com a semana em
 * andamento fechando no preço daquele dia (mínima e máxima só dos dias já passados).
 */
export function weeklyAsOf(weekly, daily, i) {
  const day = daily[i];
  const end = day.time + DAY_MS;
  let count = 0;
  while (count < weekly.length && weekly[count].time <= day.time) count++;
  const out = weekly.slice(0, count);
  const cur = out[count - 1];
  if (!cur || cur.time + 7 * DAY_MS <= end) return out;
  let low = Infinity;
  let high = -Infinity;
  for (let j = i; j >= 0 && daily[j].time >= cur.time; j--) {
    low = Math.min(low, daily[j].low ?? daily[j].close);
    high = Math.max(high, daily[j].high ?? daily[j].close);
  }
  out[count - 1] = { ...cur, close: day.close, low, high };
  return out;
}

/**
 * Lado ("bottom" | "top" | null) de cada sinal de fundo/topo no fim do dia `i`. Indisponível conta como null.
 * Inclui o placar daquele dia em `region` (null = região neutra) e, em `region-strong`, "bottom" quando a
 * região de fundo estava no nível forte.
 */
export function extremeStatesAt({ daily, weekly, fearGreed, funding, liquidations }, i, cfg = SIGNAL_DEFAULTS) {
  const now = daily[i].time + DAY_MS;
  const d = daily.slice(0, i + 1);
  const w = weeklyAsOf(weekly || [], daily, i);
  const signals = [
    rsiSignal(d, "d", now, cfg), rsiSignal(w, "w", now, cfg),
    rsiDivergenceSignal(d, "d", now, cfg), rsiDivergenceSignal(w, "w", now, cfg),
    stretchSignal(d, "d", now, cfg), stretchSignal(w, "w", now, cfg),
    fearGreedSignal(fearGreed, now, cfg), fundingSignal(funding, now, cfg), liquidationSignal(liquidations, now, cfg),
  ];
  const on = {};
  for (const s of signals) {
    s.family = SIGNAL_FAMILIES.find((f) => f.ids.includes(s.id))?.key ?? null;
    on[s.id] = s.available && s.active ? s.side : null;
  }
  const region = regionOf(signals, cfg);
  on[REGION_KEY] = region.side === "neutral" ? null : region.side;
  on[STRONG_KEY] = region.strong ? "bottom" : null;
  return on;
}

/**
 * Percorre o histórico e devolve [{ t, close, on: { id: lado } }], um item por dia já fechado.
 * A conta é longa (alguns segundos para 8 anos): a cada `sliceMs` chama `pause()` para a página respirar e
 * `shouldStop()` para desistir (troca de moeda); desistindo, devolve null. now: instante da análise, para
 * deixar de fora a vela diária ainda em formação.
 */
export async function signalHistory(input, { now, cfg = SIGNAL_DEFAULTS, opts = HISTORY_DEFAULTS, shouldStop, pause, clock = Date.now } = {}) {
  const daily = input.daily || [];
  const wait = pause || (() => new Promise((resolve) => setTimeout(resolve)));
  const days = [];
  let sliceStart = clock();
  for (let i = opts.firstDay; i < daily.length; i++) {
    if (now !== undefined && daily[i].time + DAY_MS > now) break;
    days.push({ t: daily[i].time, close: daily[i].close, on: extremeStatesAt(input, i, cfg) });
    if (clock() - sliceStart >= opts.sliceMs) {
      await wait();
      if (shouldStop?.()) return null;
      sliceStart = clock();
    }
  }
  return days;
}

const median = (values) => {
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// resumo das variações (frações): quantas, quantas positivas, mediana, pior e melhor
const summarize = (changes) =>
  changes.length
    ? { n: changes.length, up: changes.filter((c) => c > 0).length, median: median(changes), worst: Math.min(...changes), best: Math.max(...changes) }
    : { n: 0, up: 0, median: null, worst: null, best: null };

/**
 * Estatística por sinal e por lado a partir do resultado de `signalHistory`.
 * Uma "vez" = o dia em que o sinal ativou depois de ficar apagado por mais de `minGapDays` (ativações
 * coladas contam como uma só). Para cada horizonte, a variação do fechamento N dias depois desse dia.
 * Devolve { days, base: { [h]: resumo de todos os dias }, signals: { [id]: { bottom?, top? } } }, com
 * cada lado = { episodes, [h]: { n, up, median, worst, best } }.
 */
export function outcomeStats(days, opts = HISTORY_DEFAULTS) {
  const change = (i, h) => (days[i + h] ? days[i + h].close / days[i].close - 1 : null);
  const base = {};
  for (const h of opts.horizons) base[h] = summarize(days.map((_, i) => change(i, h)).filter((c) => c !== null));

  const starts = {}; // "id|lado" → índices dos dias de ativação
  const lastOn = {};
  days.forEach((day, i) => {
    for (const [id, side] of Object.entries(day.on)) {
      if (!side) continue;
      const key = `${id}|${side}`;
      if (lastOn[key] === undefined || i - lastOn[key] > opts.minGapDays) (starts[key] ||= []).push(i);
      lastOn[key] = i;
    }
  });

  const signals = {};
  for (const [key, list] of Object.entries(starts)) {
    const [id, side] = key.split("|");
    const stat = { episodes: list.length };
    for (const h of opts.horizons) stat[h] = summarize(list.map((i) => change(i, h)).filter((c) => c !== null));
    (signals[id] ||= {})[side] = stat;
  }
  return { days: days.length, base, signals };
}

// arredonda antes de pôr o sinal, para não sair "-0%"
const pctText = (v) => {
  const n = Math.round(v * 100) || 0;
  return `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR")}%`;
};

/**
 * Frase com o histórico de um sinal ativo: "Nas 14 vezes anteriores nesta moeda: 30 dias depois, alta em
 * 10 (71%), mediana +12%; 90 dias depois, alta em 11 de 13 (85%), mediana +31%." stat = um lado de
 * outcomeStats(...).signals[id]; sem ocorrência anterior completa, diz que é a primeira vez.
 */
export function outcomeText(stat, opts = HISTORY_DEFAULTS) {
  const first = opts.horizons[0];
  const total = stat?.[first]?.n || 0;
  if (!total) return "Primeira vez no histórico carregado desta moeda: não há como comparar.";
  const parts = opts.horizons
    .filter((h) => stat[h].n)
    .map((h) => {
      const r = stat[h];
      const of = r.n === total ? "" : ` de ${r.n}`;
      return `${h} dias depois, alta em ${r.up}${of} (${Math.round((r.up / r.n) * 100)}%), mediana ${pctText(r.median)}`;
    });
  const lead = total === 1 ? "Na única vez anterior" : `Nas ${total} vezes anteriores`;
  const few = total < opts.minEpisodes ? " (pouco para concluir)" : "";
  return `${lead} nesta moeda${few}: ${parts.join("; ")}.`;
}

/** Frase da linha de base: o que o preço fez a partir de um dia qualquer do mesmo histórico. */
export function baseText(base, opts = HISTORY_DEFAULTS) {
  const parts = opts.horizons
    .filter((h) => base?.[h]?.n)
    .map((h) => `${h} dias depois, alta em ${Math.round((base[h].up / base[h].n) * 100)}% dos dias, mediana ${pctText(base[h].median)}`);
  return parts.length ? `Para comparar, a partir de um dia qualquer desta moeda: ${parts.join("; ")}.` : "";
}

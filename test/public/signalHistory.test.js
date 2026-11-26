// Histórico dos sinais, "o que aconteceu depois" (public/components/price-chart/signals/signalHistory.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseText, extremeStatesAt, HISTORY_DEFAULTS, outcomeStats, outcomeText, REGION_KEY, signalHistory, STRONG_KEY, weeklyAsOf,
} from "../../public/components/price-chart/signals/signalHistory.js";
import { SIGNAL_DEFAULTS } from "../../public/components/price-chart/signals/signals.js";

const DAY = 24 * 60 * 60 * 1000;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, veio ${a}`);
const candles = (closes) => closes.map((close, i) => ({ time: i * DAY, close, low: close - 1, high: close + 1 }));

test("weeklyAsOf: a semana em andamento fecha no preço do dia, só com os dias já passados", () => {
  const daily = candles([10, 11, 12, 13, 14, 15, 16, 20, 18, 25]);
  // semanas começando nos dias 0 e 7; os valores finais da 2ª semana (do futuro) não podem aparecer
  const weekly = [
    { time: 0, open: 10, close: 16, low: 9, high: 17 },
    { time: 7 * DAY, open: 20, close: 99, low: 1, high: 99 },
    { time: 14 * DAY, open: 30, close: 30, low: 30, high: 30 },
  ];
  // dia 8: a 1ª semana está fechada e fica como veio; a 2ª vai só até o dia 8
  const w = weeklyAsOf(weekly, daily, 8);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0], weekly[0]);
  assert.deepEqual(w[1], { time: 7 * DAY, open: 20, close: 18, low: 17, high: 21 });
  // não altera as velas originais
  assert.equal(weekly[1].close, 99);
  // dia 6: fim da 1ª semana, já fechada
  assert.deepEqual(weeklyAsOf(weekly, daily, 6), [weekly[0]]);
  // dia 3: no meio da 1ª semana
  assert.deepEqual(weeklyAsOf(weekly, daily, 3), [{ time: 0, open: 10, close: 13, low: 9, high: 14 }]);
  assert.deepEqual(weeklyAsOf([], daily, 3), []);
});

test("extremeStatesAt: um lado por sinal de fundo/topo, mais o placar", () => {
  const daily = candles([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4.5, 4, 3.5, 3]);
  const on = extremeStatesAt({ daily, weekly: [], fearGreed: [{ t: 19 * DAY, v: 10 }], funding: null, liquidations: null }, 19);
  assert.deepEqual(Object.keys(on).sort(), [
    "fng", "funding", "liq", REGION_KEY, STRONG_KEY, "rsi-d", "rsi-div-d", "rsi-div-w", "rsi-w", "stretch-d", "stretch-w",
  ].sort());
  // só quedas: RSI diário sobrevendido; medo extremo; o resto sem histórico ou sem fonte
  assert.equal(on["rsi-d"], "bottom");
  assert.equal(on.fng, "bottom");
  assert.equal(on["stretch-d"], null);
  assert.equal(on.liq, null);
  // duas famílias de fundo não chegam à região de fundo (nem ao nível forte)
  assert.equal(on[REGION_KEY], null);
  assert.equal(on[STRONG_KEY], null);
  // o Fear & Greed publicado depois do dia avaliado não entra
  assert.equal(extremeStatesAt({ daily, weekly: [], fearGreed: [{ t: 19 * DAY, v: 10 }] }, 15).fng, null);
});

test("signalHistory: um item por dia fechado, com pausas e desistência", async () => {
  const daily = candles(Array.from({ length: 30 }, (_, i) => 100 - i));
  const input = { daily, weekly: [], fearGreed: null, funding: null, liquidations: null };
  const opts = { ...HISTORY_DEFAULTS, firstDay: 20, sliceMs: 0 };
  let pauses = 0;
  const pause = async () => void pauses++;
  // now no meio do último dia: a vela em formação fica de fora
  const days = await signalHistory(input, { now: 29 * DAY + 1000, opts, pause });
  assert.equal(days.length, 9);
  assert.deepEqual([days[0].t, days.at(-1).t], [20 * DAY, 28 * DAY]);
  assert.equal(days[0].close, 80);
  assert.equal(days.at(-1).on["rsi-d"], "bottom");
  assert.equal(pauses, 9);
  // sem `now`, vai até a última vela
  assert.equal((await signalHistory(input, { opts, pause })).length, 10);
  // desiste na primeira pausa (troca de moeda)
  assert.equal(await signalHistory(input, { opts, pause, shouldStop: () => true }), null);
  assert.deepEqual(await signalHistory({ daily: [] }, { opts, pause }), []);
});

// dias montados à mão: preço e, em alguns, um sinal "x" ativo
const days = (closes, on = {}) => closes.map((close, i) => ({ t: i * DAY, close, on: { x: on[i] || null } }));
const opts = { ...HISTORY_DEFAULTS, horizons: [1, 3], minGapDays: 2, minEpisodes: 3 };

test("outcomeStats: uma vez por ativação, com a variação depois de cada horizonte", () => {
  // ativa nos dias 1–2 (uma vez só), no dia 6 (apagado por mais de 2 dias: outra vez) e no dia 9
  const list = days([100, 100, 110, 120, 130, 100, 200, 100, 100, 50, 60], { 1: "bottom", 2: "bottom", 6: "bottom", 9: "bottom" });
  const s = outcomeStats(list, opts);
  assert.equal(s.days, 11);
  const x = s.signals.x.bottom;
  assert.equal(x.episodes, 3);
  // 1 dia depois: dia 1 → +10%, dia 6 → −50%, dia 9 → +20%
  assert.deepEqual([x[1].n, x[1].up], [3, 2]);
  near(x[1].median, 0.1);
  near(x[1].worst, -0.5);
  near(x[1].best, 0.2);
  // 3 dias depois: dia 1 → +30%, dia 6 → −75%; o dia 9 ainda não tem 3 dias à frente
  assert.deepEqual([x[3].n, x[3].up], [2, 1]);
  near(x[3].median, (0.3 - 0.75) / 2);
  assert.equal(s.signals.x.top, undefined);
  // linha de base: todos os dias com o horizonte completo
  assert.equal(s.base[1].n, 10);
  assert.equal(s.base[3].n, 8);
  assert.equal(s.base[1].up, 5);
});

test("outcomeStats: ativações coladas contam uma vez; lados separados; sinal que nunca ativou", () => {
  // apagado só no dia 3 (menos que o intervalo mínimo): continua a mesma vez
  const flicker = outcomeStats(days([10, 11, 12, 13, 14, 15, 16, 17], { 1: "top", 2: "top", 4: "top" }), opts);
  assert.equal(flicker.signals.x.top.episodes, 1);
  near(flicker.signals.x.top[1].median, 12 / 11 - 1);
  // fundo e topo do mesmo sinal têm estatísticas próprias
  const both = outcomeStats(days([10, 11, 12, 13, 14, 15], { 0: "bottom", 4: "top" }), opts);
  assert.equal(both.signals.x.bottom.episodes, 1);
  assert.equal(both.signals.x.top.episodes, 1);
  assert.deepEqual(outcomeStats(days([10, 11, 12]), opts).signals, {});
  assert.deepEqual(outcomeStats([], opts), { days: 0, base: { 1: { n: 0, up: 0, median: null, worst: null, best: null }, 3: { n: 0, up: 0, median: null, worst: null, best: null } }, signals: {} });
});

test("outcomeText: frase do histórico de um sinal", () => {
  const r = (n, up, median) => ({ n, up, median, worst: -0.5, best: 0.5 });
  assert.equal(
    outcomeText({ episodes: 15, 30: r(14, 10, 0.12), 90: r(13, 11, 0.314) }),
    "Nas 14 vezes anteriores nesta moeda: 30 dias depois, alta em 10 (71%), mediana +12%; 90 dias depois, alta em 11 de 13 (85%), mediana +31%."
  );
  // poucas vezes: avisa; mediana negativa sem "+"
  assert.equal(
    outcomeText({ episodes: 3, 30: r(3, 1, -0.04), 90: r(3, 2, 0) }),
    "Nas 3 vezes anteriores nesta moeda (pouco para concluir): 30 dias depois, alta em 1 (33%), mediana -4%; 90 dias depois, alta em 2 (67%), mediana 0%."
  );
  assert.equal(
    outcomeText({ episodes: 2, 30: r(1, 1, 0.2), 90: r(0, 0, null) }),
    "Na única vez anterior nesta moeda (pouco para concluir): 30 dias depois, alta em 1 (100%), mediana +20%."
  );
  // mediana que arredonda para zero não sai como "-0%"
  assert.match(outcomeText({ episodes: 6, 30: r(6, 2, -0.004), 90: r(6, 3, 0.004) }), /mediana 0%; 90 dias depois, alta em 3 \(50%\), mediana 0%\.$/);
  // ativou agora pela primeira vez (ou nunca tinha ativado)
  const first = "Primeira vez no histórico carregado desta moeda: não há como comparar.";
  assert.equal(outcomeText({ episodes: 1, 30: r(0, 0, null), 90: r(0, 0, null) }), first);
  assert.equal(outcomeText(undefined), first);
});

test("baseText: frase da linha de base", () => {
  const r = (n, up, median) => ({ n, up, median });
  assert.equal(
    baseText({ 30: r(1000, 560, 0.02), 90: r(900, 522, 0.08) }),
    "Para comparar, a partir de um dia qualquer desta moeda: 30 dias depois, alta em 56% dos dias, mediana +2%; 90 dias depois, alta em 58% dos dias, mediana +8%."
  );
  assert.equal(baseText({ 30: r(0, 0, null), 90: r(0, 0, null) }), "");
  assert.equal(baseText(undefined), "");
});

test("HISTORY_DEFAULTS: horizontes e intervalo entre ativações", () => {
  assert.deepEqual(HISTORY_DEFAULTS.horizons, [30, 90]);
  assert.equal(HISTORY_DEFAULTS.minGapDays, 14);
  assert.ok(SIGNAL_DEFAULTS.rsiPeriod < HISTORY_DEFAULTS.firstDay);
});

// Sinais de compra e venda (public/components/price-chart/signals/signals.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSignals, lastClosedIndex, percentileRank, regionOf, rsiSignal, SIGNAL_DEFAULTS, streak, stretchSignal, trendSignal,
} from "../../public/components/price-chart/signals/signals.js";

const DAY = 24 * 60 * 60 * 1000;
// velas diárias a partir do dia 0; `now` no fim da última = todas fechadas
const pts = (closes, step = DAY) => closes.map((close, i) => ({ time: i * step, close }));
const endOf = (points, step = DAY) => points.at(-1).time + step;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, veio ${a}`);

// configuração pequena, para montar as séries à mão
const cfg = {
  ...SIGNAL_DEFAULTS,
  d: { ms: DAY, maShort: 2, maLong: 4, stretchMa: 4, minSamples: 5 },
  w: { ms: 7 * DAY, maShort: 2, maLong: 4, stretchMa: 4, minSamples: 5 },
  slopeBars: 2,
  rsiPeriod: 3,
};

test("lastClosedIndex: a última vela só conta se já terminou", () => {
  const p = pts([1, 2, 3]);
  assert.equal(lastClosedIndex(p, DAY, 3 * DAY), 2);
  assert.equal(lastClosedIndex(p, DAY, 3 * DAY - 1), 1);
  assert.equal(lastClosedIndex(pts([1]), DAY, 10), -1);
  assert.equal(lastClosedIndex([], DAY, 10), -1);
  assert.equal(lastClosedIndex(null, DAY, 10), -1);
});

test("streak: conta para trás até falhar ou achar null", () => {
  const gt = (v) => v > 5;
  assert.equal(streak([1, 9, 8, 7], 3, gt), 3);
  assert.equal(streak([9, null, 8, 7], 3, gt), 2);
  assert.equal(streak([9, 8, 1], 2, gt), 0);
  assert.equal(streak([9, 8, 1], 1, gt), 2);
  assert.equal(streak([9, 8], -1, gt), 0);
});

test("percentileRank: parte da amostra abaixo do valor", () => {
  const s = [1, 2, 3, 4];
  assert.equal(percentileRank(s, 0), 0);
  assert.equal(percentileRank(s, 3), 50);
  assert.equal(percentileRank(s, 3.5), 75);
  assert.equal(percentileRank(s, 9), 100);
  assert.equal(percentileRank([], 1), null);
});

test("trendSignal: alta, baixa e lateral", () => {
  const up = pts([1, 2, 3, 4, 5, 6]);
  const s = trendSignal(up, "d", endOf(up), cfg);
  assert.equal(s.id, "trend-ma-d");
  assert.equal(s.side, "up");
  assert.equal(s.active, true);
  // a SMA 4 existe a partir da 4ª vela: 3 velas seguidas em alta
  assert.equal(s.bars, 3);
  // SMA 4 atual = 4,5; duas velas atrás = 2,5
  near(s.details.slope, 80);
  assert.match(s.text, /^Tendência diária: alta há 3 dias/);

  const down = pts([6, 5, 4, 3, 2, 1]);
  assert.equal(trendSignal(down, "d", endOf(down), cfg).side, "down");

  // fechou abaixo da média curta, mas acima da longa: lateral, e não conta como ativo
  const side = pts([1, 2, 3, 4, 5, 6, 5.2]);
  const l = trendSignal(side, "d", endOf(side), cfg);
  assert.equal(l.side, "side");
  assert.equal(l.active, false);
  assert.equal(l.bars, 1);
});

test("trendSignal: vela em formação não entra em 'há N velas'", () => {
  const p = pts([6, 5, 4, 3, 4, 9]);
  // a última vela (9) vira a tendência para alta, mas ainda não fechou
  const s = trendSignal(p, "d", endOf(p) - 1, cfg);
  assert.equal(s.side, "up");
  assert.equal(s.bars, 0);
  assert.equal(s.forming, true);
  assert.match(s.text, /na vela em formação/);
});

test("trendSignal: sem histórico para a média longa", () => {
  const p = pts([1, 2, 3]);
  const s = trendSignal(p, "d", endOf(p), cfg);
  assert.equal(s.available, false);
  assert.equal(s.reason, "history");
  assert.equal(trendSignal([], "w", 0, cfg).available, false);
  assert.equal(trendSignal(null, "w", 0, cfg).available, false);
});

test("rsiSignal: sobrevendido, sobrecomprado e neutro", () => {
  // só baixas: RSI 0 desde a 4ª vela (período 3) → 3 velas na zona
  const down = pts([10, 9, 8, 7, 6, 5]);
  const s = rsiSignal(down, "d", endOf(down), cfg);
  assert.equal(s.id, "rsi-d");
  assert.equal(s.side, "bottom");
  assert.equal(s.value, 0);
  assert.equal(s.bars, 3);
  assert.equal(s.active, true);
  assert.match(s.text, /sobrevendido há 3 dias/);

  const up = pts([1, 2, 3, 4, 5], 7 * DAY);
  const t = rsiSignal(up, "w", endOf(up, 7 * DAY), cfg);
  assert.equal(t.side, "top");
  assert.equal(t.bars, 2);
  assert.match(t.text, /RSI 3 semanal em 100,0: sobrecomprado há 2 semanas/);

  // variações +2, −1, +1 → RSI 75 com níveis 20/80: neutro
  const mid = pts([10, 12, 11, 12]);
  const m = rsiSignal(mid, "d", endOf(mid), { ...cfg, rsiOversold: 20, rsiOverbought: 80 });
  assert.equal(m.active, false);
  assert.equal(m.side, null);
  assert.equal(m.bars, 0);
  near(m.value, 75);
});

test("rsiSignal: só a vela em formação na zona, e poucas velas", () => {
  // RSI 75 nas velas fechadas (neutro com 30/80); a vela em formação sobe forte e passa de 80
  const p = pts([10, 12, 11, 12, 30]);
  const s = rsiSignal(p, "d", endOf(p) - 1, { ...cfg, rsiOverbought: 80 });
  assert.equal(s.side, "top");
  assert.equal(s.bars, 0);
  assert.equal(s.forming, true);

  const few = pts([1, 2]);
  assert.equal(rsiSignal(few, "d", endOf(few), cfg).available, false);
});

test("stretchSignal: fundo e topo pelo percentil do histórico da moeda", () => {
  // preço parado em 100 (esticagem 0) e depois uma queda forte
  const drop = pts([...new Array(12).fill(100), 60]);
  const s = stretchSignal(drop, "d", endOf(drop), cfg);
  assert.equal(s.id, "stretch-d");
  assert.equal(s.side, "bottom");
  assert.equal(s.bars, 1);
  // SMA 4 = (100·3 + 60)/4 = 90 → 60/90 − 1
  near(s.value, (60 / 90 - 1) * 100);
  assert.equal(s.percentile, 0);
  near(s.details.min, s.value);
  assert.equal(s.details.max, 0);
  assert.equal(s.details.samples, 10);
  assert.match(s.text, /muito abaixo da média há 1 dia/);

  const pump = pts([...new Array(12).fill(100), 180]);
  const t = stretchSignal(pump, "d", endOf(pump), cfg);
  assert.equal(t.side, "top");
  assert.ok(t.percentile >= 90);
});

test("stretchSignal: a vela em formação é comparada com as fechadas, sem entrar na amostra", () => {
  const p = pts([...new Array(12).fill(100), 60]);
  const s = stretchSignal(p, "d", endOf(p) - 1, cfg);
  assert.equal(s.side, "bottom");
  assert.equal(s.bars, 0);
  assert.equal(s.forming, true);
  assert.equal(s.details.samples, 9);
  assert.equal(s.details.min, 0);
});

test("stretchSignal: percentil baixo com preço acima da média não é fundo", () => {
  // sempre subindo: a esticagem é sempre positiva; a menor delas não vira sinal de fundo
  const closes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 1100];
  const p = pts(closes);
  const s = stretchSignal(p, "d", endOf(p), cfg);
  assert.ok(s.value > 0);
  assert.ok(s.percentile <= 10);
  assert.equal(s.active, false);
  assert.equal(s.side, null);
});

test("stretchSignal: histórico insuficiente", () => {
  const p = pts([100, 100, 100, 100, 100, 60]);
  const s = stretchSignal(p, "d", endOf(p), cfg);
  assert.equal(s.available, false);
  assert.equal(s.reason, "history");
});

test("regionOf: placar só com sinais disponíveis do grupo de fundo/topo", () => {
  const sig = (side, extra = {}) => ({ group: "extreme", available: true, active: !!side, side, ...extra });
  assert.deepEqual(regionOf([sig("bottom"), sig("bottom"), sig("bottom"), sig("top"), sig(null)]), { side: "bottom", bottom: 3, top: 1, of: 5 });
  assert.equal(regionOf([sig("top"), sig("top"), sig("top")]).side, "top");
  // dois de cada lado, ou só dois: neutra
  assert.equal(regionOf([sig("bottom"), sig("bottom"), sig("bottom"), sig("top"), sig("top")]).side, "neutral");
  assert.equal(regionOf([sig("bottom"), sig("bottom")]).side, "neutral");
  // indisponíveis e sinais de tendência ficam fora do placar
  const mixed = [sig("bottom"), sig(null, { available: false }), { group: "trend", available: true, active: true, side: "down" }];
  assert.deepEqual(regionOf(mixed), { side: "neutral", bottom: 1, top: 0, of: 1 });
  assert.deepEqual(regionOf([]), { side: "neutral", bottom: 0, top: 0, of: 0 });
});

test("analyzeSignals: junta tudo num resultado serializável", () => {
  const daily = pts([...new Array(12).fill(100), 99, 98, 97, 60]);
  const weekly = pts([1, 2, 3, 4, 5, 6], 7 * DAY);
  const now = endOf(daily);
  const r = analyzeSignals({ asset: "BTC", daily, weekly, now }, cfg);

  assert.equal(r.asset, "BTC");
  assert.equal(r.generatedAt, now);
  assert.deepEqual(r.signals.map((s) => s.id), ["trend-ma-d", "trend-ma-w", "rsi-d", "rsi-w", "stretch-d", "stretch-w"]);
  assert.deepEqual(r.trend, { d: "down", w: "up" });
  // diário: RSI sobrevendido e preço esticado para baixo; semanal: RSI sobrecomprado e esticagem sem histórico
  assert.deepEqual(r.region, { side: "neutral", bottom: 2, top: 1, of: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

test("analyzeSignals: sem velas, tudo indisponível", () => {
  const r = analyzeSignals({ asset: "X", daily: [], weekly: null, now: 0 });
  assert.deepEqual(r.trend, { d: null, w: null });
  assert.deepEqual(r.region, { side: "neutral", bottom: 0, top: 0, of: 0 });
  assert.ok(r.signals.every((s) => !s.available && s.reason === "history"));
});

test("SIGNAL_DEFAULTS: limiares da v1", () => {
  assert.deepEqual([SIGNAL_DEFAULTS.d.maShort, SIGNAL_DEFAULTS.d.maLong, SIGNAL_DEFAULTS.d.stretchMa], [50, 200, 200]);
  assert.deepEqual([SIGNAL_DEFAULTS.w.maShort, SIGNAL_DEFAULTS.w.maLong, SIGNAL_DEFAULTS.w.stretchMa], [20, 50, 50]);
  assert.deepEqual([SIGNAL_DEFAULTS.rsiPeriod, SIGNAL_DEFAULTS.rsiOversold, SIGNAL_DEFAULTS.rsiOverbought], [14, 30, 70]);
});

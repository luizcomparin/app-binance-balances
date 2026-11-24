// MACD (public/components/price-chart/chart/macd.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { macd, MACD_DEFAULT, macdHistogramTones, normalizeMacdSettings } from "../../public/components/price-chart/chart/macd.js";
import { movingAverage } from "../../public/components/price-chart/chart/movingAverage.js";

const pts = (closes) => closes.map((close) => ({ close }));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `esperado ${b}, veio ${a}`);

test("normalizeMacdSettings: padrão, limites e valores inválidos", () => {
  assert.deepEqual(normalizeMacdSettings(null), MACD_DEFAULT);
  const r = normalizeMacdSettings({
    fast: 1, slow: 999, signal: 0, oscType: "SMA", signalType: "WMA",
    macdColor: "#010203", signalColor: "x", showHist: false, histUpColor: "#abcdef", histDownColor: "", histOpacity: 3,
  });
  assert.deepEqual(r, {
    fast: 2, slow: 200, signal: 1, oscType: "SMA", signalType: "EMA",
    macdColor: "#010203", signalColor: MACD_DEFAULT.signalColor, showHist: false,
    histUpColor: "#abcdef", histDownColor: MACD_DEFAULT.histDownColor, histOpacity: 1,
  });
  assert.equal(normalizeMacdSettings({ fast: "abc" }).fast, 12);
});

test("macd: linha = média rápida − média lenta; sinal = média da linha; histograma = diferença", () => {
  const closes = [10, 11, 13, 12, 15, 17, 16, 18, 21, 20];
  const s = normalizeMacdSettings({ fast: 2, slow: 4, signal: 3 });
  const r = macd(pts(closes), s);
  const fast = movingAverage(pts(closes), 2, "EMA");
  const slow = movingAverage(pts(closes), 4, "EMA");
  // a lenta (4) só começa na 4ª vela
  assert.deepEqual(r.macd.slice(0, 3), [null, null, null]);
  for (let i = 3; i < closes.length; i++) close(r.macd[i], fast[i] - slow[i]);
  // sinal EMA 3 da linha: começa pela SMA dos 3 primeiros valores da linha (velas 3, 4 e 5)
  assert.deepEqual(r.signal.slice(0, 5), [null, null, null, null, null]);
  close(r.signal[5], (r.macd[3] + r.macd[4] + r.macd[5]) / 3);
  const k = 2 / 4;
  close(r.signal[6], r.macd[6] * k + r.signal[5] * (1 - k));
  for (let i = 5; i < closes.length; i++) close(r.hist[i], r.macd[i] - r.signal[i]);
  assert.equal(r.hist[4], null);
});

test("macd: médias simples (SMA) e poucas velas", () => {
  const r = macd(pts([1, 2, 3, 4, 5]), normalizeMacdSettings({ fast: 2, slow: 3, signal: 2, oscType: "SMA", signalType: "SMA" }));
  // SMA2 − SMA3 numa reta de passo 1 = 0,5 sempre
  assert.deepEqual(r.macd, [null, null, 0.5, 0.5, 0.5]);
  assert.deepEqual(r.signal, [null, null, null, 0.5, 0.5]);
  assert.deepEqual(macd(pts([1, 2]), MACD_DEFAULT), { macd: [null, null], signal: [null, null], hist: [null, null] });
  assert.deepEqual(macd(null, MACD_DEFAULT), { macd: [], signal: [], hist: [] });
});

test("macdHistogramTones: forte quando se afasta de zero, fraco quando volta", () => {
  assert.deepEqual(macdHistogramTones([null, 1, 2, 1.5, -1, -2, -1.5]), [
    null,
    { up: true, strong: true },
    { up: true, strong: true },
    { up: true, strong: false },
    { up: false, strong: true },
    { up: false, strong: true },
    { up: false, strong: false },
  ]);
});

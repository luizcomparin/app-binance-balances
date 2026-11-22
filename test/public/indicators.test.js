// Médias móveis e Bandas de Bollinger (public/components/price-chart/chart/movingAverage.js e bollinger.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { maColor, maLabel, movingAverage } from "../../public/components/price-chart/chart/movingAverage.js";
import { bollinger } from "../../public/components/price-chart/chart/bollinger.js";

const closes = (values) => values.map((close, i) => ({ time: i, close, volume: close * 10 }));
const near = (arr, expected) =>
  expected.forEach((v, i) => (v === null ? assert.equal(arr[i], null) : assert.ok(Math.abs(arr[i] - v) < 1e-9, `[${i}] esperado ${v}, veio ${arr[i]}`)));

test("SMA: alinhada às velas, null no aquecimento", () => {
  near(movingAverage(closes([1, 2, 3, 4, 5]), 3, "SMA"), [null, null, 2, 3, 4]);
});

test("EMA: começa pela SMA e pesa mais as velas recentes", () => {
  // k = 2 / (3 + 1) = 0,5: idx 2 = SMA (2); idx 3 = 10 × 0,5 + 2 × 0,5 = 6
  near(movingAverage(closes([1, 2, 3, 10]), 3, "EMA"), [null, null, 2, 6]);
  near(movingAverage(closes([1, 2, 3, 10]), 3, "SMA"), [null, null, 2, 5]);
});

test("média do volume (field)", () => {
  near(movingAverage(closes([1, 2, 3]), 2, "SMA", "volume"), [null, 15, 25]);
});

test("período maior que as velas: tudo null", () => {
  assert.deepEqual(movingAverage(closes([1, 2]), 5), [null, null]);
});

test("maColor e maLabel", () => {
  assert.equal(maColor({ color: "#ffd166", opacity: 0.5 }), "rgba(255, 209, 102, 0.5)");
  assert.equal(maColor({ color: "#000000" }), "rgba(0, 0, 0, 1)");
  assert.equal(maLabel({ type: "EMA", period: 50 }), "EMA 50");
});

test("Bollinger: média simples ± k desvios padrão populacionais", () => {
  const { basis, upper, lower } = bollinger(closes([1, 2, 3, 4]), 2, 2);
  near(basis, [null, 1.5, 2.5, 3.5]);
  near(upper, [null, 2.5, 3.5, 4.5], "desvio de 0,5 × 2");
  near(lower, [null, 0.5, 1.5, 2.5]);
});

test("Bollinger: preço constante fecha as bandas; parâmetros inválidos dão null", () => {
  const { basis, upper, lower } = bollinger(closes([7, 7, 7]), 3, 2);
  near(basis, [null, null, 7]);
  near(upper, [null, null, 7]);
  near(lower, [null, null, 7]);
  assert.deepEqual(bollinger(closes([1, 2, 3]), 1, 2).basis, [null, null, null], "período < 2");
});

// Fear & Greed Index no gráfico (public/components/price-chart/chart/fearGreed.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { alignFearGreed, fearGreedClass, FNG_CLASSES } from "../../public/components/price-chart/chart/fearGreed.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const D0 = Date.UTC(2026, 0, 5); // segunda-feira, 00:00 UTC
const row = (day, v, c = "fear") => ({ t: D0 + day * DAY, v, c });
const bars = (times) => times.map((time) => ({ time }));

test("fearGreedClass: zonas conhecidas e classificação desconhecida", () => {
  assert.equal(fearGreedClass("extreme-fear"), FNG_CLASSES["extreme-fear"]);
  assert.equal(fearGreedClass("greed").label, "Ganância");
  assert.deepEqual(fearGreedClass(null), fearGreedClass("outra"));
  assert.equal(fearGreedClass(null).label, "");
  assert.match(fearGreedClass(null).color, /^#[0-9a-f]{6}$/i);
});

test("alignFearGreed: sem velas ou sem dados", () => {
  assert.deepEqual(alignFearGreed([], [row(0, 10)]), { values: [], classes: [] });
  assert.deepEqual(alignFearGreed(null, null), { values: [], classes: [] });
  assert.deepEqual(alignFearGreed(bars([D0, D0 + DAY]), []), { values: [null, null], classes: [null, null] });
});

test("alignFearGreed: vela diária fica com o valor do dia; antes do primeiro valor, null", () => {
  const points = bars([D0, D0 + DAY, D0 + 2 * DAY, D0 + 3 * DAY]);
  const rows = [row(1, 20, "extreme-fear"), row(2, 50, "neutral"), row(3, 80, "extreme-greed")];
  assert.deepEqual(alignFearGreed(points, rows), {
    values: [null, 20, 50, 80],
    classes: [null, "extreme-fear", "neutral", "extreme-greed"],
  });
});

test("alignFearGreed: dia sem valor repete o anterior", () => {
  const points = bars([D0, D0 + DAY, D0 + 2 * DAY]);
  assert.deepEqual(alignFearGreed(points, [row(0, 30), row(2, 40)]).values, [30, 30, 40]);
});

test("alignFearGreed: velas de 4h repetem o valor do dia, inclusive começando no meio do dia", () => {
  const points = bars([D0 + 20 * HOUR, D0 + DAY, D0 + DAY + 4 * HOUR, D0 + DAY + 8 * HOUR]);
  const rows = [row(0, 30), row(1, 45, "fear")];
  assert.deepEqual(alignFearGreed(points, rows).values, [30, 45, 45, 45]);
});

test("alignFearGreed: vela semanal fica com o valor do último dia dela", () => {
  const points = bars([D0, D0 + 7 * DAY]);
  const rows = [...Array.from({ length: 7 }, (_, d) => row(d, 10 + d)), row(7, 60, "greed"), row(8, 70, "greed")];
  assert.deepEqual(alignFearGreed(points, rows), { values: [16, 70], classes: ["fear", "greed"] });
});

test("alignFearGreed: fonte parada há mais de 2 dias não repete o último valor", () => {
  const points = bars([D0, D0 + DAY, D0 + 2 * DAY, D0 + 3 * DAY, D0 + 4 * DAY]);
  assert.deepEqual(alignFearGreed(points, [row(0, 30), row(1, 35)]).values, [30, 35, 35, 35, null]);
  // vela semanal em andamento: começa antes do último valor, então continua valendo
  assert.deepEqual(alignFearGreed(bars([D0, D0 + 7 * DAY]), [row(0, 30), row(9, 35)]).values, [30, 35]);
});

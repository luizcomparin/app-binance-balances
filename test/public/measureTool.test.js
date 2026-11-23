// Texto da régua de medição (public/components/price-chart/chart/measureTool.js), usado também pela
// ferramenta "Medição de preço" da barra de desenhos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { measureLines } from "../../public/components/price-chart/chart/measureTool.js";

const DAY = 24 * 3600 * 1000;
const pts = [1, 2, 3, 4, 5].map((v, i) => ({ time: i * DAY, volume: v * 1e9 }));

test("measureLines: alta entre duas velas soma o volume das velas cobertas", () => {
  const r = measureLines(pts, 1, 3, 100, 110, "1d");
  assert.equal(r.diff, 10);
  assert.equal(r.lines[0], "10,00 (10,00%)");
  assert.equal(r.lines[1], "2 barras, 2d");
  assert.equal(r.lines[2], "Vol 9,0B"); // velas 1..3: 2 + 3 + 4
});

test("measureLines: queda, sentido invertido e pontas além dos dados", () => {
  const r = measureLines(pts, 6, 3, 100, 80, "1d");
  assert.equal(r.diff, -20);
  assert.match(r.lines[0], /\(-20,00%\)$/);
  assert.equal(r.lines[1], "-3 barras, 3d");
  assert.equal(r.lines[2], "Vol 9,0B"); // só as velas que existem: 3 e 4
});

test("measureLines: 1 barra no singular e vela mensal em meses", () => {
  assert.equal(measureLines(pts, 0, 1, 1, 2, "1M").lines[1], "1 barra, 1 mês");
});

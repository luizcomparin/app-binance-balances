// Opções do mapa de liquidação (public/components/price-chart/chart/liquidationOverlay.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIQ_MAP_DEFAULT, normalizeLiqMapSettings } from "../../public/components/price-chart/chart/liquidationOverlay.js";

test("sem nada salvo: o padrão (igual ao desenho de antes das opções)", () => {
  assert.deepEqual(normalizeLiqMapSettings(null), { ...LIQ_MAP_DEFAULT });
  assert.equal(LIQ_MAP_DEFAULT.minIntensity, 0.06);
  assert.equal(LIQ_MAP_DEFAULT.lowColor, "#5032a0");
  assert.equal(LIQ_MAP_DEFAULT.highColor, "#ffd200");
  assert.equal(LIQ_MAP_DEFAULT.labels, 3);
});

test("valores válidos são mantidos (os do formulário chegam como texto)", () => {
  const s = normalizeLiqMapSettings({
    sides: "short",
    history: false,
    minIntensity: 0.2,
    opacity: 0.5,
    lowColor: "#000000",
    highColor: "#FF0000",
    profile: false,
    labels: "5",
  });
  assert.deepEqual(s, {
    sides: "short",
    history: false,
    minIntensity: 0.2,
    opacity: 0.5,
    lowColor: "#000000",
    highColor: "#FF0000",
    profile: false,
    labels: 5,
  });
});

test("fora dos limites ou inválido: limita ou volta ao padrão", () => {
  const s = normalizeLiqMapSettings({ sides: "x", history: "sim", minIntensity: 2, opacity: 0, lowColor: "red", labels: 4 });
  assert.equal(s.sides, "both");
  assert.equal(s.history, true);
  assert.equal(s.minIntensity, 0.5);
  assert.equal(s.opacity, 0.1);
  assert.equal(s.lowColor, LIQ_MAP_DEFAULT.lowColor);
  assert.equal(s.labels, 3);
  assert.equal(normalizeLiqMapSettings({ minIntensity: "abc" }).minIntensity, 0.06);
});

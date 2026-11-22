// Formatação pt-BR (public/core/format.js), escapeHtml (public/core/dom.js) e eixos (chart/axis.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPct, formatPrice, formatQty, formatSigned, signClass } from "../../public/core/format.js";
import { escapeHtml } from "../../public/core/dom.js";
import { formatAxisPrice, fromChartTime, priceFormatFor, toChartTime } from "../../public/components/price-chart/chart/axis.js";

test("formatCurrency (extensão de Number/String): 2 casas no padrão pt-BR", () => {
  assert.equal((1234.5).formatCurrency(), "1.234,50");
  assert.equal("7".formatCurrency(), "7,00");
  assert.equal("abc".formatCurrency(), "0,00");
});

test("formatPrice: casas adaptativas", () => {
  assert.equal(formatPrice(1234.5), "1.234,50");
  assert.equal(formatPrice(1.23456), "1,2346");
  assert.equal(formatPrice(0.000123456), "0,0001235", "abaixo de 1: 4 dígitos significativos");
  assert.equal(formatPrice(null), "--");
  assert.equal(formatPrice(NaN), "--");
});

test("formatQty: sem zeros sobrando, até 8 casas", () => {
  assert.equal(formatQty(1.5), "1,5");
  assert.equal(formatQty(0.123456789), "0,12345679");
  assert.equal(formatQty(undefined), "--");
});

test("formatSigned, formatPct e signClass", () => {
  assert.equal(formatSigned(1.234), "+1,23");
  assert.equal(formatSigned(-2), "-2,00");
  assert.equal(formatSigned(0.001), "0,00", "quase zero não leva sinal");
  assert.equal(formatSigned(null), "--");
  assert.equal(formatPct(1.5), "+1,50%");
  assert.equal(formatPct(-0.25), "-0,25%");
  assert.equal(signClass(1), "pnl-pos");
  assert.equal(signClass(-1), "pnl-neg");
  assert.equal(signClass(0.001), "");
  assert.equal(signClass(null), "");
});

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.equal(escapeHtml(42), "42");
});

test("toChartTime/fromChartTime: intradiário desloca pelo fuso; diário segue o dia UTC", () => {
  const ms = Date.UTC(2026, 5, 15, 12, 0, 0);
  assert.equal(toChartTime(ms, "1d"), ms / 1000);
  assert.equal(toChartTime(ms, "1h"), (ms - new Date(ms).getTimezoneOffset() * 60000) / 1000);
  assert.equal(fromChartTime(toChartTime(ms, "1h"), "1h"), ms);
  assert.equal(fromChartTime(toChartTime(ms, "1w"), "1w"), ms);
});

test("priceFormatFor: precisão do eixo pela grandeza do preço", () => {
  assert.equal(priceFormatFor(50000).precision, 2);
  assert.equal(priceFormatFor(5).precision, 4);
  assert.equal(priceFormatFor(0.000012).precision, 8);
  assert.equal(priceFormatFor(0).precision, 4);
  assert.ok(Math.abs(priceFormatFor(5).minMove - 0.0001) < 1e-15, "minMove = 10^-precisão");
});

test("formatAxisPrice: sem resíduos de ponto flutuante nem '-0'", () => {
  assert.equal(formatAxisPrice(2.7755575615628914e-17, 4), "0");
  assert.equal(formatAxisPrice(-1e-10, 4), "0");
  assert.equal(formatAxisPrice(1.23456, 2), "1,23");
});

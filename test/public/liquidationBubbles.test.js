// Liquidações reais sobre o gráfico: posicionamento e estilos (public/components/price-chart/chart/liquidationBubbles.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barBubbles,
  bubbleRadius,
  bubbleScale,
  bubblesAbove,
  liquidationEvents,
  parseBubblesLimit,
  parseUsdAmount,
  priceProfile,
  topBubbles,
  topShareCutoff,
} from "../../public/components/price-chart/chart/liquidationBubbles.js";

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 0, 1);
// velas diárias do gráfico: abertura 100+i, máxima 110+i, mínima 90+i
const points = [0, 1, 2].map((i) => ({ time: T0 + i * DAY, open: 100 + i, high: 110 + i, low: 90 + i, close: 100 + i }));
const row = (t, binance, bybit = { long: 0, short: 0 }) => ({
  t,
  long: binance.long + bybit.long,
  short: binance.short + bybit.short,
  by: { Binance: binance, Bybit: bybit },
});
// velas de 1h de um dia inteiro a partir de `day`: mínima 95 − h e máxima 105 + h na hora h
const hourlyCandles = (day) =>
  Array.from({ length: 24 }, (_, h) => ({ time: day + h * HOUR, open: 100, high: 105 + h, low: 95 - h, close: 100 }));

test("sem dado horário: longs na mínima da vela do gráfico, shorts na máxima, com a faixa até a abertura", () => {
  const ev = liquidationEvents(points, [row(T0, { long: 10, short: 0 }, { long: 5, short: 3 })]);
  assert.deepEqual(ev, [
    { index: 0, t: T0, side: "long", usd: 15, price: 90, lo: 90, hi: 100 },
    { index: 0, t: T0, side: "short", usd: 3, price: 110, lo: 100, hi: 110 },
  ]);
});

test("só Binance usa by.Binance; linha sem Binance é ignorada; antes do gráfico fica de fora", () => {
  const rows = [
    row(T0, { long: 10, short: 0 }, { long: 5, short: 3 }),
    { t: T0 + 2 * DAY, long: 7, short: 0, by: { OKX: { long: 7, short: 0 } } },
    row(T0 - DAY, { long: 1, short: 1 }),
  ];
  assert.deepEqual(
    liquidationEvents(points, rows, null, "binance").map((e) => [e.index, e.side, e.usd]),
    [[0, "long", 10]]
  );
  assert.deepEqual(liquidationEvents([], rows), []);
});

test("com dado horário: cada hora na sua vela de 1h; velas do gráfico antes da cobertura usam a vela do gráfico", () => {
  // dado horário cobre só o dia 1 (vela índice 1)
  const hourly = {
    // (a primeira linha marca o início do dado horário; zerada não gera evento)
    rows: [row(T0 + DAY, { long: 0, short: 0 }), row(T0 + DAY + 2 * HOUR, { long: 30, short: 0 }), row(T0 + DAY + 10 * HOUR, { long: 0, short: 20 })],
    candles: hourlyCandles(T0 + DAY),
  };
  // linhas diárias do gráfico para os dias 0 e 1 (a do dia 1 é substituída pelo horário)
  const rows = [row(T0, { long: 5, short: 0 }), row(T0 + DAY, { long: 999, short: 999 })];
  const ev = liquidationEvents(points, rows, hourly);
  assert.deepEqual(
    ev.map((e) => [e.index, e.side, e.usd, e.price]),
    [
      [0, "long", 5, 90], // dia 0: vela do gráfico
      [1, "long", 30, 93], // hora 2: mínima 95 − 2
      [1, "short", 20, 115], // hora 10: máxima 105 + 10
    ]
  );
});

test("vela do gráfico coberta só em parte pelo horário usa a vela do gráfico", () => {
  // horário começa ao meio-dia do dia 1: a vela do dia 1 não está inteira → só a partir do dia 2
  const hourly = { rows: [row(T0 + DAY + 12 * HOUR, { long: 1, short: 0 }), row(T0 + 2 * DAY + HOUR, { long: 2, short: 0 })], candles: [...hourlyCandles(T0 + DAY), ...hourlyCandles(T0 + 2 * DAY)] };
  const rows = [row(T0 + DAY, { long: 7, short: 0 })];
  assert.deepEqual(
    liquidationEvents(points, rows, hourly).map((e) => [e.index, e.usd, e.price]),
    [
      [1, 7, 91],
      [2, 2, 94],
    ]
  );
});

test("barBubbles: soma por vela e lado, preço = média ponderada pelo valor", () => {
  const events = [
    { index: 1, side: "long", usd: 30, price: 90 },
    { index: 1, side: "long", usd: 10, price: 100 },
    { index: 1, side: "short", usd: 5, price: 120 },
  ];
  assert.deepEqual(barBubbles(events), [
    { index: 1, side: "long", usd: 40, price: 92.5 },
    { index: 1, side: "short", usd: 5, price: 120 },
  ]);
});

test("priceProfile: espalha cada evento na sua faixa, só nas velas pedidas", () => {
  const events = [
    { index: 0, side: "long", usd: 100, price: 90, lo: 90, hi: 100 }, // 90–100: metade em cada faixa de 5
    { index: 1, side: "short", usd: 40, price: 104, lo: 104, hi: 104 }, // sem faixa: tudo na faixa do preço
    { index: 5, side: "long", usd: 999, price: 90, lo: 90, hi: 100 }, // fora das velas pedidas
  ];
  const p = priceProfile(events, { fromIndex: 0, toIndex: 2, lo: 90, hi: 110, rows: 4 });
  assert.deepEqual(
    p.map((r) => [r.from, r.to, Math.round(r.long), r.short]),
    [
      [90, 95, 50, 0],
      [95, 100, 50, 0],
      [100, 105, 0, 40],
      [105, 110, 0, 0],
    ]
  );
  // evento metade fora da faixa visível: só a parte de dentro conta
  const half = priceProfile([{ index: 0, side: "long", usd: 100, price: 80, lo: 80, hi: 100 }], { fromIndex: 0, toIndex: 0, lo: 90, hi: 110, rows: 2 });
  assert.equal(Math.round(half[0].long), 50);
});

test("priceProfile: escala log divide em faixas geométricas", () => {
  const events = [{ index: 0, side: "long", usd: 90, price: 10, lo: 10, hi: 100 }];
  const p = priceProfile(events, { fromIndex: 0, toIndex: 0, lo: 1, hi: 1000, rows: 3, log: true });
  assert.deepEqual(
    p.map((r) => [Math.round(r.from), Math.round(r.to), Math.round(r.long)]),
    [
      [1, 10, 0],
      [10, 100, 90],
      [100, 1000, 0],
    ]
  );
  // ponto sem faixa: cai na faixa geométrica certa
  const one = priceProfile([{ index: 0, side: "short", usd: 7, price: 500, lo: 500, hi: 500 }], { fromIndex: 0, toIndex: 0, lo: 1, hi: 1000, rows: 3, log: true });
  assert.equal(one[2].short, 7);
});

test("topBubbles: as N maiores no intervalo de velas, a partir do limite", () => {
  const bubbles = [
    { index: 0, usd: 50 },
    { index: 1, usd: 80 },
    { index: 2, usd: 10 },
    { index: 9, usd: 500 },
  ];
  assert.deepEqual(topBubbles(bubbles, 2, 0, 3).map((b) => b.usd), [80, 50]);
  assert.deepEqual(topBubbles(bubbles, 5, 0, 3, 40).map((b) => b.usd), [80, 50]);
});

test("escala pelo percentil 98 e raio proporcional à raiz do valor", () => {
  const bubbles = Array.from({ length: 100 }, (_, i) => ({ usd: i + 1 }));
  assert.equal(bubbleScale(bubbles), 99);
  assert.equal(bubbleScale([]), 1);
  const big = bubbleRadius(100, 100);
  const quarter = bubbleRadius(25, 100);
  assert.ok(big > quarter);
  assert.equal(bubbleRadius(1000, 100), big); // acima da escala fica no máximo
  assert.equal(bubbleRadius(1, 100), null); // pequena demais
});

test("parseUsdAmount: sufixos K/M/B (e mil/mi/bi), vírgula decimal, vazio = 0, inválido = null", () => {
  assert.equal(parseUsdAmount("5M"), 5e6);
  assert.equal(parseUsdAmount("1,5 mi"), 1.5e6);
  assert.equal(parseUsdAmount("500k"), 5e5);
  assert.equal(parseUsdAmount("2B"), 2e9);
  assert.equal(parseUsdAmount("US$ 300000"), 300000);
  assert.equal(parseUsdAmount(" "), 0);
  assert.equal(parseUsdAmount("abc"), null);
  assert.equal(parseUsdAmount("-5M"), null);
});

test("bubblesAbove: esconde as menores que o limite, mas a escala continua a de todas", () => {
  const bubbles = Array.from({ length: 100 }, (_, i) => ({ usd: i + 1 }));
  const all = bubblesAbove(bubbles);
  const big = bubblesAbove(bubbles, 90);
  assert.equal(all.list.length, 100);
  assert.equal(big.list.length, 11);
  assert.ok(big.list.every((b) => b.usd >= 90));
  assert.equal(big.scale, all.scale);
  assert.deepEqual(bubblesAbove(null, 5), { list: [], scale: 1 });
});

test("parseBubblesLimit: US$ ou porcentagem; inválido = null", () => {
  assert.deepEqual(parseBubblesLimit("5M"), { usd: 5e6, pct: 0 });
  assert.deepEqual(parseBubblesLimit("20%"), { usd: 0, pct: 20 });
  assert.deepEqual(parseBubblesLimit(" 12,5 % "), { usd: 0, pct: 12.5 });
  assert.deepEqual(parseBubblesLimit(""), { usd: 0, pct: 0 });
  assert.deepEqual(parseBubblesLimit("0%"), { usd: 0, pct: 0 });
  assert.deepEqual(parseBubblesLimit("100%"), { usd: 0, pct: 100 });
  assert.equal(parseBubblesLimit("150%"), null);
  assert.equal(parseBubblesLimit("5M%"), null);
  assert.equal(parseBubblesLimit("%"), null);
  assert.equal(parseBubblesLimit("abc"), null);
});

test("topShareCutoff: corte das pct% maiores só entre as velas visíveis", () => {
  const bubbles = Array.from({ length: 100 }, (_, i) => ({ index: i, usd: i + 1 }));
  // todas visíveis: 20% de 100 = as 20 maiores (81..100)
  assert.equal(topShareCutoff(bubbles, 20, 0, 99), 81);
  // só as velas 0..9 (valores 1..10): 20% de 10 = as 2 maiores (9 e 10)
  assert.equal(topShareCutoff(bubbles, 20, 0, 9), 9);
  // arredonda para cima e sempre sobra pelo menos uma
  assert.equal(topShareCutoff(bubbles, 1, 0, 9), 10);
  assert.equal(topShareCutoff(bubbles, 25, 0, 9), 8);
  // sem porcentagem, 100% ou sem bolhas visíveis: todas
  assert.equal(topShareCutoff(bubbles, 0, 0, 99), 0);
  assert.equal(topShareCutoff(bubbles, 100, 0, 99), 0);
  assert.equal(topShareCutoff(bubbles, 20, 200, 300), 0);
});

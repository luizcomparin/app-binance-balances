// Sinais de compra e venda (public/components/price-chart/signals/signals.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSignals, fearGreedSignal, fundingSignal, lastClosedIndex, liquidationSignal, macdSignal, midRank, percentileRank, regionOf,
  rsiDivergenceSignal, rsiSignal, SIGNAL_DEFAULTS, SIGNAL_FAMILIES, streak, stretchSignal, trendSignal,
} from "../../public/components/price-chart/signals/signals.js";

const DAY = 24 * 60 * 60 * 1000;
// velas diárias a partir do dia 0; `now` no fim da última = todas fechadas
const pts = (closes, step = DAY) => closes.map((close, i) => ({ time: i * step, close }));
const endOf = (points, step = DAY) => points.at(-1).time + step;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, veio ${a}`);

// configuração pequena, para montar as séries à mão
const cfg = {
  ...SIGNAL_DEFAULTS,
  d: { ms: DAY, maShort: 2, maLong: 4, stretchMa: 4, minSamples: 5, divPivot: 2, divMaxGap: 10, divRecent: 4 },
  w: { ms: 7 * DAY, maShort: 2, maLong: 4, stretchMa: 4, minSamples: 5, divPivot: 2, divMaxGap: 10, divRecent: 4 },
  slopeBars: 2,
  rsiPeriod: 3,
  macd: { fast: 2, slow: 3, signal: 2, oscType: "EMA", signalType: "EMA" },
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
  // inclusivo: conta também os iguais (valores repetidos na amostra)
  assert.equal(percentileRank([1, 2, 2, 2], 2), 25);
  assert.equal(percentileRank([1, 2, 2, 2], 2, true), 100);
  assert.equal(percentileRank(s, 0, true), 0);
});

test("midRank: empates divididos ao meio", () => {
  // série parada: 50, não é extremo
  assert.equal(midRank([2, 2, 2, 2], 2), 50);
  // empatado com o máximo: continua no alto
  assert.equal(midRank([1, 1, 1, 1, 1, 1, 1, 1, 2, 2], 2), 90);
  assert.equal(midRank([1, 2, 3, 4], 9), 100);
  assert.equal(midRank([1, 2, 3, 4], 0), 0);
  assert.equal(midRank([], 1), null);
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

// divergência: RSI de 3 e pivôs com 2 velas de cada lado (cfg). Queda forte até 10 (RSI 0), repique, e uma
// queda mais lenta até 9,5: fundo mais baixo no preço com o RSI mais alto (15,8)
const BULL_DIV = [20, 19, 18, 10, 14, 16, 15, 13, 11, 9.5, 11, 12];
const BEAR_DIV = [10, 11, 12, 20, 16, 14, 15, 17, 19, 20.5, 19, 18];

test("rsiDivergenceSignal: divergência de alta e de baixa", () => {
  const bull = pts(BULL_DIV);
  const s = rsiDivergenceSignal(bull, "d", endOf(bull), cfg);
  assert.equal(s.id, "rsi-div-d");
  assert.equal(s.group, "extreme");
  assert.equal(s.side, "bottom");
  assert.equal(s.active, true);
  // 2º fundo na vela 9; fechadas até a 11
  assert.equal(s.bars, 2);
  assert.deepEqual([s.details.first.price, s.details.second.price], [10, 9.5]);
  assert.deepEqual([s.details.first.time, s.details.second.time], [3 * DAY, 9 * DAY]);
  assert.equal(s.details.first.rsi, 0);
  assert.ok(s.details.second.rsi > 15 && s.details.second.rsi < 16);
  assert.equal(s.value, s.details.second.rsi);
  assert.equal(
    s.text,
    "Divergência no RSI diário: de alta; preço fez fundo mais baixo (10,00 → 9,50) e o RSI, fundo mais alto (0,0 → 15,8); 2º fundo há 2 dias"
  );

  const bear = pts(BEAR_DIV, 7 * DAY);
  const t = rsiDivergenceSignal(bear, "w", endOf(bear, 7 * DAY), cfg);
  assert.equal(t.id, "rsi-div-w");
  assert.equal(t.side, "top");
  assert.equal(
    t.text,
    "Divergência no RSI semanal: de baixa; preço fez topo mais alto (20,00 → 20,50) e o RSI, topo mais baixo (100,0 → 84,2); 2º topo há 2 semanas"
  );
});

test("rsiDivergenceSignal: usa a mínima e a máxima das velas", () => {
  // os fechamentos sozinhos dariam fundo mais ALTO (10 → 10,5); pelas mínimas o 2º fundo é mais baixo (9,8 → 9,2)
  const closes = [20, 19, 18, 10, 14, 16, 15, 13, 11, 10.5, 11, 12];
  const candles = closes.map((close, i) => ({ time: i * DAY, close, low: close - (i === 9 ? 1.3 : 0.2), high: close + 0.2 }));
  const s = rsiDivergenceSignal(candles, "d", endOf(candles), cfg);
  assert.equal(s.side, "bottom");
  near(s.details.first.price, 9.8);
  near(s.details.second.price, 9.2);
  assert.equal(rsiDivergenceSignal(pts(closes), "d", endOf(candles), cfg).active, false);
});

test("rsiDivergenceSignal: sem divergência quando o RSI acompanha o preço", () => {
  // fundo mais baixo no preço (10,5 → 5) e também no RSI
  const p = pts([10, 12, 11, 12, 11, 10.5, 12, 13, 12, 8, 5, 7, 8]);
  const s = rsiDivergenceSignal(p, "d", endOf(p), cfg);
  assert.equal(s.available, true);
  assert.equal(s.active, false);
  assert.equal(s.side, null);
  assert.equal(s.text, "Divergência no RSI diário: nenhuma recente");
});

test("rsiDivergenceSignal: deixa de valer com novo extremo, com o tempo ou com o 1º pivô em RSI neutro", () => {
  // a vela em formação faz nova mínima abaixo do 2º fundo
  const broken = pts([...BULL_DIV, 9]);
  assert.equal(rsiDivergenceSignal(broken, "d", endOf(broken) - 1, cfg).active, false);
  // 2º fundo há mais velas que o limite (4)
  const old = pts([...BULL_DIV, 12, 12, 12]);
  assert.equal(rsiDivergenceSignal(old, "d", endOf(old), cfg).active, false);
  assert.equal(rsiDivergenceSignal(old, "d", endOf(old), { ...cfg, d: { ...cfg.d, divRecent: 5 } }).bars, 5);
  // pivôs longe demais um do outro (6 velas)
  const bull = pts(BULL_DIV);
  assert.equal(rsiDivergenceSignal(bull, "d", endOf(bull), { ...cfg, d: { ...cfg.d, divMaxGap: 5 } }).active, false);
  // o 1º fundo precisa ter acontecido com o RSI fraco
  assert.equal(rsiDivergenceSignal(bull, "d", endOf(bull), { ...cfg, divRsiLow: -1 }).active, false);
});

test("rsiDivergenceSignal: o 2º pivô só vale depois de confirmado por velas fechadas", () => {
  // com a última vela ainda em formação, o fundo da vela 9 só tem 1 vela fechada depois dele
  const bull = pts(BULL_DIV);
  assert.equal(rsiDivergenceSignal(bull, "d", endOf(bull) - 1, cfg).active, false);
  // histórico curto demais para o RSI e dois pivôs
  const few = pts([10, 9, 8, 7, 8, 9]);
  const s = rsiDivergenceSignal(few, "d", endOf(few), cfg);
  assert.equal(s.available, false);
  assert.equal(s.reason, "history");
  assert.equal(rsiDivergenceSignal([], "w", 0, cfg).available, false);
  assert.equal(rsiDivergenceSignal(null, "w", 0, cfg).available, false);
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

test("macdSignal: acima de zero favorece alta, abaixo favorece baixa", () => {
  // subindo cada vez mais: MACD positivo desde a 3ª vela (média lenta de 3) e histograma crescendo
  const up = pts([1, 2, 4, 8, 16, 32, 64]);
  const s = macdSignal(up, "d", endOf(up), cfg);
  assert.equal(s.id, "macd-d");
  assert.equal(s.group, "trend");
  assert.equal(s.side, "up");
  assert.equal(s.bars, 5);
  assert.deepEqual([s.details.cross, s.details.weakening], [null, false]);
  assert.equal(s.text, "MACD diário (2/3/2): acima de zero há 5 dias (favorece alta)");

  // caindo cada vez menos: MACD negativo, mas o histograma (positivo) vem encolhendo
  const down = pts([64, 32, 16, 8, 4, 2, 1], 7 * DAY);
  const d = macdSignal(down, "w", endOf(down, 7 * DAY), cfg);
  assert.equal(d.side, "down");
  assert.equal(d.bars, 5);
  assert.equal(d.details.weakening, true);
  assert.equal(d.text, "MACD semanal (2/3/2): abaixo de zero há 5 semanas (favorece baixa); histograma perdendo força");
});

test("macdSignal: cruzamento recente com a linha de sinal", () => {
  // a alta perde o fôlego na última vela: o MACD segue positivo, mas cai abaixo do sinal
  const stall = pts([1, 2, 4, 8, 16, 32, 64, 66]);
  const s = macdSignal(stall, "d", endOf(stall), cfg);
  assert.equal(s.side, "up");
  assert.deepEqual(s.details.cross, { dir: "down", barsAgo: 0 });
  assert.match(s.text, /cruzou o sinal para baixo na última vela$/);

  // virada: cruzou para baixo há 2 velas e o MACD já está negativo há 2
  const turn = pts([1, 2, 4, 8, 16, 32, 64, 40, 20, 10]);
  const t = macdSignal(turn, "d", endOf(turn), cfg);
  assert.equal(t.side, "down");
  assert.equal(t.bars, 2);
  assert.deepEqual(t.details.cross, { dir: "down", barsAgo: 2 });
  assert.match(t.text, /cruzou o sinal para baixo há 2 velas; histograma perdendo força$/);
  // cruzamento mais antigo que o limite não é avisado
  assert.equal(macdSignal(turn, "d", endOf(turn), { ...cfg, macdCrossBars: 2 }).details.cross, null);
});

test("macdSignal: vela em formação e histórico insuficiente", () => {
  // a última vela (em formação) derruba o MACD para baixo de zero
  const p = pts([1, 2, 4, 8, 16, 32, 64, 40, 20]);
  const s = macdSignal(p, "d", endOf(p) - 1, cfg);
  assert.equal(s.side, "down");
  assert.equal(s.bars, 0);
  assert.equal(s.forming, true);

  // o histograma precisa da média lenta (3) mais o sinal (2): 4 velas
  const few = pts([1, 2, 4]);
  assert.equal(macdSignal(few, "d", endOf(few), cfg).available, false);
  assert.equal(macdSignal([], "w", 0, cfg).reason, "history");
  assert.equal(macdSignal(null, "w", 0, cfg).available, false);
});

const fngRows = (values) => values.map((v, i) => ({ t: i * DAY, v }));

test("fearGreedSignal: medo extremo, ganância extrema e sem extremo", () => {
  const fear = fngRows([40, 30, 25, 20, 12]);
  const s = fearGreedSignal(fear, 4 * DAY + 1000);
  assert.equal(s.id, "fng");
  assert.equal(s.group, "extreme");
  assert.equal(s.timeframe, null);
  assert.equal(s.side, "bottom");
  assert.equal(s.value, 12);
  // 25, 20 e 12: o limite (25) já conta
  assert.equal(s.bars, 3);
  assert.equal(s.forming, false);
  assert.equal(s.text, "Fear & Greed em 12: medo extremo há 3 dias (índice do mercado)");

  const greed = fearGreedSignal(fngRows([50, 75, 76]), 2 * DAY);
  assert.equal(greed.side, "top");
  // 75 ainda é "ganância" na Alternative.me: só o 76 conta
  assert.equal(greed.bars, 1);
  assert.match(greed.text, /ganância extrema há 1 dia/);

  const mid = fearGreedSignal(fngRows([10, 50]), DAY);
  assert.equal(mid.available, true);
  assert.equal(mid.active, false);
  assert.equal(mid.side, null);
  assert.equal(mid.bars, 0);
  assert.match(mid.text, /^Fear & Greed em 50: sem extremo/);
});

test("fearGreedSignal: sem dados, fonte parada e valores depois de `now`", () => {
  assert.equal(fearGreedSignal(null, 0).reason, "no-data");
  assert.equal(fearGreedSignal([], 0).reason, "no-data");
  // último valor há mais de 2 dias
  const stale = fearGreedSignal(fngRows([10, 10]), 3 * DAY + 1);
  assert.equal(stale.available, false);
  assert.equal(stale.reason, "stale");
  assert.equal(fearGreedSignal(fngRows([10, 10]), 3 * DAY).available, true);
  // análise de uma data passada: os valores publicados depois dela não entram
  const past = fearGreedSignal(fngRows([10, 15, 90, 95]), DAY + 1);
  assert.equal(past.value, 15);
  assert.equal(past.bars, 2);
});

// funding: uma cobrança a cada 8 h; fcfg usa janela de 2 dias e histórico mínimo de 5
const H8 = DAY / 3;
const fundingRows = (rates) => rates.map((r, i) => ({ t: i * H8, r }));
const fcfg = { ...SIGNAL_DEFAULTS, fundingDays: 2, fundingMinDays: 5 };
const lastT = (rows) => rows.at(-1).t;

test("fundingSignal: negativo e entre os mais baixos é fundo; alto é topo", () => {
  // 20 dias em +0,01% e os 2 últimos em −0,02%
  const neg = fundingRows([...new Array(60).fill(0.0001), ...new Array(6).fill(-0.0002)]);
  const s = fundingSignal({ rows: neg }, lastT(neg), fcfg);
  assert.equal(s.id, "funding");
  assert.equal(s.group, "extreme");
  assert.equal(s.side, "bottom");
  near(s.value, -0.0002);
  assert.equal(s.percentile, 0);
  // a janela de hoje é toda negativa; a de ontem (metade positiva, metade negativa) já tinha média negativa
  // e entre as mais baixas; a de anteontem ainda era toda positiva
  assert.equal(s.bars, 2);
  assert.match(s.text, /^Funding médio de 2 dias em -0,0200% por cobrança: negativo e entre os mais baixos há 2 dias/);

  // taxa travada no teto por 3 dias: várias janelas empatadas no máximo continuam contando como topo
  const high = fundingRows([...new Array(60).fill(0.0001), ...new Array(9).fill(0.001)]);
  const t = fundingSignal({ rows: high }, lastT(high), fcfg);
  assert.equal(t.side, "top");
  near(t.value, 0.001);
  // hoje e ontem a janela é toda no teto; a de anteontem (metade no teto) ainda não chegava aos 10% mais altos
  assert.equal(t.bars, 2);
  assert.match(t.text, /entre os mais altos há 2 dias/);
});

test("fundingSignal: exige o lado certo do zero e ignora o que veio depois de `now`", () => {
  // sempre positivo e caindo: a média atual é a mais baixa do histórico, mas não é negativa
  const falling = fundingRows(Array.from({ length: 36 }, (_, i) => 0.001 - i * 0.00002));
  const s = fundingSignal({ rows: falling }, lastT(falling), fcfg);
  assert.ok(s.value > 0);
  assert.equal(s.percentile, 0);
  assert.equal(s.active, false);
  assert.equal(s.side, null);
  assert.match(s.text, /: acima de 0% dos últimos 12 dias$/);

  // análise de uma data passada: as taxas negativas do fim ainda não tinham acontecido
  const neg = fundingRows([...new Array(30).fill(0.0001), ...new Array(6).fill(-0.0002)]);
  const past = fundingSignal({ rows: neg }, neg[29].t, fcfg);
  near(past.value, 0.0001);
  assert.equal(past.active, false);
});

test("fundingSignal: fonte ausente, parada ou com pouco histórico", () => {
  const rows = fundingRows(new Array(36).fill(0.0001));
  assert.equal(fundingSignal(null, 0, fcfg).reason, "no-data");
  assert.equal(fundingSignal({ rows: [] }, 0, fcfg).reason, "no-data");
  const noPerp = fundingSignal({ reason: "no-perpetual" }, 0, fcfg);
  assert.equal(noPerp.available, false);
  assert.equal(noPerp.reason, "no-perpetual");
  assert.equal(noPerp.text, "Funding: a moeda não tem contrato perpétuo");
  assert.equal(fundingSignal({ reason: "error" }, 0, fcfg).text, "Funding: fonte indisponível no momento");
  // histórico de 11,7 dias com mínimo de 60 (padrão)
  assert.equal(fundingSignal({ rows }, lastT(rows)).reason, "history");
  // última cobrança há mais de 2 dias
  assert.equal(fundingSignal({ rows }, lastT(rows) + 2 * DAY + 1, fcfg).reason, "stale");
  assert.equal(fundingSignal({ rows }, lastT(rows) + DAY, fcfg).available, true);
});

// liquidações: uma linha por dia (US$); lcfg usa janela de 2 dias e histórico mínimo de 5
const liqRows = (days) => days.map(([long, short], i) => ({ t: i * DAY, long, short })).filter((r) => r.long || r.short);
const lcfg = { ...SIGNAL_DEFAULTS, liqDays: 2, liqMinDays: 5, liqLookbackDays: 100 };
const calm = (n) => Array.from({ length: n }, () => [10e6, 10e6]);

test("liquidationSignal: cascata de longs é fundo; de shorts é topo", () => {
  const longs = liqRows([...calm(12), [300e6, 5e6], [200e6, 5e6]]);
  const now = 13 * DAY + 1000; // no meio do último dia
  const s = liquidationSignal({ rows: longs }, now, lcfg);
  assert.equal(s.id, "liq");
  assert.equal(s.side, "bottom");
  assert.equal(s.value, 500e6);
  assert.equal(s.percentile, 100);
  // janelas terminando hoje (500M) e ontem (310M) estão acima de 90% das anteriores
  assert.equal(s.bars, 2);
  assert.deepEqual([s.details.long, s.details.short], [500e6, 10e6]);
  assert.equal(
    s.text,
    "Liquidações em 2 dias: 500,0M em longs (acima de 100% do histórico) e 10,0M em shorts (acima de 0% do histórico): cascata de longs há 2 dias"
  );

  const shorts = liqRows([...calm(12), [5e6, 10e6], [5e6, 400e6]]);
  const t = liquidationSignal({ rows: shorts }, now, lcfg);
  assert.equal(t.side, "top");
  assert.equal(t.value, 410e6);
  assert.equal(t.bars, 1);
  assert.match(t.text, /cascata de shorts há 1 dia$/);
});

test("liquidationSignal: os dois lados em cascata, dias sem linha e período calmo", () => {
  // os dois lados no topo do histórico: empate no percentil, vale o de maior valor (shorts)
  const both = liqRows([...calm(12), [300e6, 400e6], [300e6, 400e6]]);
  assert.equal(liquidationSignal({ rows: both }, 13 * DAY + 1000, lcfg).side, "top");

  // a fonte omite os dias zerados: contam como zero e a janela atual fica vazia
  const gap = liqRows([...calm(12), [0, 0], [0, 0]]);
  const g = liquidationSignal({ rows: gap }, 13 * DAY + 1000, lcfg);
  assert.equal(g.available, true);
  assert.equal(g.active, false);
  assert.deepEqual([g.details.long, g.details.short], [0, 0]);
  assert.match(g.text, /^Liquidações em 2 dias: 0 em longs \(acima de 0% do histórico\) e 0 em shorts/);

  const flat = liquidationSignal({ rows: liqRows(calm(14)) }, 13 * DAY + 1000, lcfg);
  assert.equal(flat.active, false);
  assert.equal(flat.bars, 0);
});

test("liquidationSignal: só compara com o histórico recente", () => {
  // cascatas enormes no passado distante ficam fora da comparação (aqui: últimos 10 dias)
  const rows = liqRows([[900e6, 0], [900e6, 0], ...calm(20), [100e6, 5e6], [100e6, 5e6]]);
  const now = 23 * DAY + 1000;
  const recent = liquidationSignal({ rows }, now, { ...lcfg, liqLookbackDays: 10 });
  assert.equal(recent.side, "bottom");
  assert.equal(recent.percentile, 100);
  // com todo o histórico, as cascatas antigas entram na amostra e o valor de hoje não é o maior
  const all = liquidationSignal({ rows }, now, lcfg);
  assert.ok(all.percentile < 100);
});

test("liquidationSignal: fonte ausente ou com pouco histórico", () => {
  assert.equal(liquidationSignal(null, 0, lcfg).reason, "no-data");
  assert.equal(liquidationSignal({ rows: [] }, 0, lcfg).reason, "no-data");
  const noKey = liquidationSignal({ reason: "no-key" }, 0, lcfg);
  assert.equal(noKey.available, false);
  assert.equal(noKey.text, "Liquidações: configure a chave da Coinalyze nas Configurações");
  assert.equal(liquidationSignal({ reason: "invalid-key" }, 0, lcfg).text, "Liquidações: a chave da Coinalyze foi recusada");
  assert.equal(liquidationSignal({ reason: "no-market" }, 0, lcfg).reason, "no-market");
  // 14 dias de histórico com mínimo de 180 (padrão)
  assert.equal(liquidationSignal({ rows: liqRows(calm(14)) }, 13 * DAY + 1000).reason, "history");
});

test("regionOf: placar só com sinais disponíveis do grupo de fundo/topo", () => {
  const sig = (side, extra = {}) => ({ group: "extreme", available: true, active: !!side, side, ...extra });
  // sem família, cada sinal conta sozinho
  assert.deepEqual(regionOf([sig("bottom"), sig("bottom"), sig("bottom"), sig("top"), sig(null)]), {
    side: "bottom", strong: false, bottom: 3, top: 1, of: 5, signals: { bottom: 3, top: 1, of: 5 },
  });
  assert.equal(regionOf([sig("top"), sig("top"), sig("top")]).side, "top");
  // dois de cada lado, ou só dois: neutra
  assert.equal(regionOf([sig("bottom"), sig("bottom"), sig("bottom"), sig("top"), sig("top")]).side, "neutral");
  assert.equal(regionOf([sig("bottom"), sig("bottom")]).side, "neutral");
  // indisponíveis e sinais de tendência ficam fora do placar
  const mixed = [sig("bottom"), sig(null, { available: false }), { group: "trend", available: true, active: true, side: "down" }];
  assert.deepEqual(regionOf(mixed), { side: "neutral", strong: false, bottom: 1, top: 0, of: 1, signals: { bottom: 1, top: 0, of: 1 } });
  assert.deepEqual(regionOf([]), { side: "neutral", strong: false, bottom: 0, top: 0, of: 0, signals: { bottom: 0, top: 0, of: 0 } });
});

test("regionOf: sinais da mesma família contam uma vez só", () => {
  const sig = (family, side, extra = {}) => ({ group: "extreme", family, available: true, active: !!side, side, ...extra });
  // quatro sinais de fundo, mas só duas famílias: não chega a "fundo provável"
  const two = regionOf([sig("rsi", "bottom"), sig("rsi", "bottom"), sig("stretch", "bottom"), sig("stretch", "bottom"), sig("div", null)]);
  assert.deepEqual(two, { side: "neutral", strong: false, bottom: 2, top: 0, of: 3, signals: { bottom: 4, top: 0, of: 5 } });
  // três famílias de fundo e uma de topo
  const three = regionOf([sig("rsi", "bottom"), sig("stretch", "bottom"), sig("sentiment", "bottom"), sig("futures", "top"), sig("futures", null)]);
  assert.deepEqual([three.side, three.bottom, three.top, three.of], ["bottom", 3, 1, 4]);
  // a mesma família pode contar para os dois lados (RSI diário sobrevendido e semanal sobrecomprado)
  const both = regionOf([sig("rsi", "bottom"), sig("rsi", "top")]);
  assert.deepEqual([both.bottom, both.top, both.of], [1, 1, 1]);
  // família só com sinais indisponíveis não entra no total
  assert.equal(regionOf([sig("rsi", "bottom"), sig("futures", null, { available: false })]).of, 1);
});

test("regionOf: nível forte só na região de fundo com o RSI semanal a favor", () => {
  const sig = (id, family, side) => ({ id, group: "extreme", family, available: true, active: !!side, side });
  const rest = [sig("stretch-d", "stretch", "bottom"), sig("fng", "sentiment", "bottom")];
  // três famílias de fundo, mas o RSI é só o diário: região de fundo comum
  const common = regionOf([sig("rsi-d", "rsi", "bottom"), ...rest]);
  assert.deepEqual([common.side, common.strong], ["bottom", false]);
  // com o RSI semanal sobrevendido ou a divergência de alta semanal: forte
  assert.equal(regionOf([sig("rsi-w", "rsi", "bottom"), ...rest]).strong, true);
  assert.equal(regionOf([sig("rsi-div-w", "div", "bottom"), ...rest]).strong, true);
  // RSI semanal a favor sem chegar à região (só duas famílias): não é forte
  const two = regionOf([sig("rsi-w", "rsi", "bottom"), sig("fng", "sentiment", "bottom")]);
  assert.deepEqual([two.side, two.strong], ["neutral", false]);
  // região de topo nunca é forte, nem com o RSI semanal sobrecomprado
  const top = regionOf([sig("rsi-w", "rsi", "top"), sig("stretch-w", "stretch", "top"), sig("fng", "sentiment", "top")]);
  assert.deepEqual([top.side, top.strong], ["top", false]);
  // o sinal semanal precisa estar do lado de fundo
  const mixed = regionOf([sig("rsi-w", "rsi", "top"), sig("rsi-d", "rsi", "bottom"), ...rest, sig("liq", "futures", "bottom")]);
  assert.deepEqual([mixed.side, mixed.strong], ["bottom", false]);
  assert.deepEqual(SIGNAL_DEFAULTS.strongBottomIds, ["rsi-w", "rsi-div-w"]);
});

test("SIGNAL_FAMILIES: todo sinal de fundo/topo tem família, e os de tendência não", () => {
  const r = analyzeSignals({ asset: "X", daily: [], weekly: [], now: 0 });
  const known = SIGNAL_FAMILIES.map((f) => f.key);
  for (const s of r.signals) {
    if (s.group === "extreme") assert.ok(known.includes(s.family), `sem família: ${s.id}`);
    else assert.equal(s.family, null);
  }
  assert.deepEqual(SIGNAL_FAMILIES.flatMap((f) => f.ids).sort(), r.signals.filter((s) => s.group === "extreme").map((s) => s.id).sort());
});

test("analyzeSignals: junta tudo num resultado serializável", () => {
  const daily = pts([...new Array(12).fill(100), 99, 98, 97, 60]);
  const weekly = pts([1, 2, 3, 4, 5, 6], 7 * DAY);
  const now = endOf(daily);
  const fearGreed = [{ t: now - DAY, v: 18 }];
  // funding sem contrato perpétuo e liquidações sem chave: indisponíveis, fora do placar
  const r = analyzeSignals(
    { asset: "BTC", daily, weekly, fearGreed, funding: { reason: "no-perpetual" }, liquidations: { reason: "no-key" }, now },
    cfg
  );

  assert.equal(r.asset, "BTC");
  assert.equal(r.generatedAt, now);
  assert.deepEqual(r.signals.map((s) => s.id), ["trend-ma-d", "trend-ma-w", "macd-d", "macd-w", "rsi-d", "rsi-w", "rsi-div-d", "rsi-div-w", "stretch-d", "stretch-w", "fng", "funding", "liq"]);
  assert.deepEqual(r.trend, { d: "down", w: "up" });
  // diário: RSI sobrevendido e preço esticado para baixo; semanal: RSI sobrecomprado e esticagem sem histórico;
  // mercado: medo extremo. Três de fundo e um de topo: fundo provável
  // Famílias de fundo: RSI, esticagem e sentimento; de topo: RSI. Disponíveis: essas três e a divergência
  // (diária, sem nenhuma recente); os futuros ficam de fora
  // o RSI semanal está sobrecomprado, não a favor: região de fundo comum
  assert.deepEqual(r.region, { side: "bottom", strong: false, bottom: 3, top: 1, of: 4, signals: { bottom: 3, top: 1, of: 5 } });
  // a tendência exibida vem das médias; o MACD é só confirmação
  assert.equal(r.signals.find((s) => s.id === "macd-w").side, "up");
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

test("analyzeSignals: sem velas, tudo indisponível", () => {
  const r = analyzeSignals({ asset: "X", daily: [], weekly: null, now: 0 });
  assert.deepEqual(r.trend, { d: null, w: null });
  assert.deepEqual(r.region, { side: "neutral", strong: false, bottom: 0, top: 0, of: 0, signals: { bottom: 0, top: 0, of: 0 } });
  assert.ok(r.signals.every((s) => !s.available));
  assert.deepEqual([...new Set(r.signals.map((s) => s.reason))], ["history", "no-data"]);
  assert.deepEqual(r.signals.slice(-2).map((s) => s.id), ["funding", "liq"]);
});

test("SIGNAL_DEFAULTS: limiares da v1", () => {
  assert.deepEqual([SIGNAL_DEFAULTS.d.maShort, SIGNAL_DEFAULTS.d.maLong, SIGNAL_DEFAULTS.d.stretchMa], [50, 200, 200]);
  assert.deepEqual([SIGNAL_DEFAULTS.w.maShort, SIGNAL_DEFAULTS.w.maLong, SIGNAL_DEFAULTS.w.stretchMa], [20, 50, 50]);
  assert.deepEqual([SIGNAL_DEFAULTS.rsiPeriod, SIGNAL_DEFAULTS.rsiOversold, SIGNAL_DEFAULTS.rsiOverbought], [14, 30, 70]);
  assert.deepEqual([SIGNAL_DEFAULTS.macd.fast, SIGNAL_DEFAULTS.macd.slow, SIGNAL_DEFAULTS.macd.signal], [12, 26, 9]);
  assert.deepEqual([SIGNAL_DEFAULTS.fngFear, SIGNAL_DEFAULTS.fngGreed], [25, 76]);
  assert.deepEqual([SIGNAL_DEFAULTS.d.divPivot, SIGNAL_DEFAULTS.d.divMaxGap, SIGNAL_DEFAULTS.d.divRecent], [5, 60, 20]);
  assert.deepEqual([SIGNAL_DEFAULTS.w.divPivot, SIGNAL_DEFAULTS.w.divMaxGap, SIGNAL_DEFAULTS.w.divRecent], [3, 26, 8]);
  assert.deepEqual([SIGNAL_DEFAULTS.divRsiLow, SIGNAL_DEFAULTS.divRsiHigh], [40, 60]);
  assert.deepEqual([SIGNAL_DEFAULTS.fundingDays, SIGNAL_DEFAULTS.fundingLow, SIGNAL_DEFAULTS.fundingHigh], [7, 10, 90]);
  assert.deepEqual([SIGNAL_DEFAULTS.liqDays, SIGNAL_DEFAULTS.liqHigh, SIGNAL_DEFAULTS.liqLookbackDays], [7, 90, 730]);
});

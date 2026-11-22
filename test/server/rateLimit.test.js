// Limitador de requisições (server/lib/rateLimit.js), contra um servidor HTTP local que imita a API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRateLimiter, limitedFetch, RateLimitError } from "../../server/lib/rateLimit.js";

// /429-1: 429 com Retry-After de 1 s só na 1ª vez · /429-long: sempre 429 com Retry-After de 120 s
// /weight: informa peso 2100 · qualquer outro caminho: 200
const hits = {};
let base;
const server = http.createServer((req, res) => {
  hits[req.url] = (hits[req.url] || 0) + 1;
  if (req.url === "/429-1" && hits[req.url] === 1) return res.writeHead(429, { "retry-after": "1" }).end();
  if (req.url === "/429-long") return res.writeHead(429, { "retry-after": "120" }).end();
  if (req.url === "/weight") return res.writeHead(200, { "x-mbx-used-weight-1m": "2100" }).end("{}");
  res.writeHead(200).end("{}");
});

before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("429 com Retry-After curto: espera e tenta de novo uma vez", async () => {
  const limiter = createRateLimiter({ name: "Teste" });
  const t0 = Date.now();
  const res = await limitedFetch([limiter], `${base}/429-1`);
  assert.equal(res.status, 200);
  assert.equal(hits["/429-1"], 2);
  assert.ok(Date.now() - t0 >= 950, "esperou o Retry-After");
});

test("429 com Retry-After longo: falha na hora e pausa as próximas sem enviá-las", async () => {
  const limiter = createRateLimiter({ name: "Teste", maxWaitMs: 2000 });
  const t0 = Date.now();
  await assert.rejects(limitedFetch([limiter], `${base}/429-long`), RateLimitError);
  assert.equal(hits["/429-long"], 1, "não insistiu");
  await assert.rejects(limitedFetch([limiter], `${base}/depois-da-pausa`), /Limite de requisições da Teste atingido \(tente em 1\d\ds\)/);
  assert.equal(hits["/depois-da-pausa"], undefined, "nem chegou a enviar");
  assert.ok(Date.now() - t0 < 1000, "não ficou esperando");
});

test("teto por janela: a requisição além do teto espera a janela liberar", async () => {
  const limiter = createRateLimiter({ name: "Teste", maxRequests: 3, windowMs: 600 });
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 4 }, () => limitedFetch([limiter], `${base}/janela`)));
  assert.equal(hits["/janela"], 4);
  assert.ok(Date.now() - t0 >= 550, "a 4ª esperou a janela");
});

test("peso acima do limite informado pela API: as próximas não saem neste minuto", async (t) => {
  if (60 - new Date().getSeconds() < 3) return t.skip("perto da virada do minuto");
  const limiter = createRateLimiter({ name: "Teste", weightHeader: "x-mbx-used-weight-1m", maxWeight: 2000, maxWaitMs: 500 });
  await limitedFetch([limiter], `${base}/weight`);
  await assert.rejects(limitedFetch([limiter], `${base}/depois-do-peso`), RateLimitError);
  assert.equal(hits["/depois-do-peso"], undefined);
});

test("RateLimitError tem status 429 e o tempo de espera", () => {
  const err = new RateLimitError("Binance Futures", 4200);
  assert.equal(err.status, 429);
  assert.equal(err.retryAfterMs, 4200);
  assert.match(err.message, /tente em 5s/);
});

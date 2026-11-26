---
titulo: Camada Fear & Greed Index
resumo: Painel abaixo do gráfico com o Crypto Fear & Greed Index da Alternative.me (sentimento do mercado, 0 a 100, um valor por dia), em linha colorida pela zona de cada dia; é o mesmo para todas as moedas.
arquivos: [server/services/fearGreed.js, server/alternativeme/client.js, public/components/price-chart/chart/fearGreed.js]
rotas: [GET /fear-greed]
eventos: []
storage: [priceChartFearGreed]
---

# Fear & Greed Index

## O que faz

O checkbox "Fear & Greed Index" (`#price-chart-fng`), em "Painéis abaixo do gráfico" nas Camadas, liga um painel com o **Crypto Fear & Greed Index**, publicado pela [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/). Ele vem depois de Liquidações e antes dos painéis de futuros, na ordem dos checkboxes.

- O índice vai de **0 (medo extremo)** a **100 (ganância extrema)** e sai **uma vez por dia**, às 00:00 UTC.
- É do **mercado como um todo**, calculado basicamente sobre o Bitcoin. O painel mostra a mesma série em qualquer moeda.
- **Linha** colorida pela zona de cada dia, com a escala fixa de 0 a 100:

  | Zona (campo `c`) | Nome no painel | Cor | Valores vistos no histórico |
  |---|---|---|---|
  | `extreme-fear` | Medo extremo | vermelho | até 25 |
  | `fear` | Medo | laranja | 26–46 |
  | `neutral` | Neutro | amarelo | 47–54 |
  | `greed` | Ganância | verde claro | 55–75 |
  | `extreme-greed` | Ganância extrema | verde | 76 ou mais |

  A zona **vem da API** (`value_classification`), não é calculada no app: a última coluna é só o que o histórico mostrava em nov/2026.
- **Linhas de referência** tracejadas em 25 e 75 (perto de onde começam as zonas extremas) e uma pontilhada em 50.
- **Título:** "Fear & Greed", o valor e a zona da vela sob a mira (ou da última) e "fonte: alternative.me". A Alternative.me pede que a fonte apareça junto do dado: **não tire esse texto**. A dica do título explica a leitura (`FUTURES_HELP.fng`).
- O painel não tem engrenagem de configurações.

## Server

`GET /fear-greed` → `services/fearGreed.js`:

1. `alternativeGet("/fng/?limit=0")` (`server/alternativeme/client.js`): `limit=0` traz todo o histórico, desde fev/2018 (cerca de 3.200 linhas).
2. `parseFearGreed(raw)` (pura, testada) converte a resposta em `rows: [{ t, v, c }]`:
   - `t`: instante do dia em ms (a API manda segundos, como texto);
   - `v`: valor de 0 a 100 (a API manda texto);
   - `c`: a zona, ou `null` se a API mandar uma classificação desconhecida;
   - ordena por tempo (a API manda do mais novo para o mais antigo), descarta linhas inválidas e dias repetidos.
3. Resposta: `{ available: true, source: "alternative.me", rows, generatedAt }`.
4. Sem linhas: `{ available: false, reason: "no-data" }`. Erro da API ou de rede: `{ available: false, reason: "error", message }`. **Sempre com status 200.**

Cache de 10 min (`fearGreed`). A API não exige chave; o limite informado é de 60 requisições por minuto, e o cliente fica em 30 (`lib/rateLimit.js`). Ver [integracoes-externas](../../referencia/integracoes-externas.md#alternativeme-httpsapialternativeme).

## Página (front)

- `chart/fearGreed.js` (puro, testado em `test/public/fearGreed.test.js`):
  - `FNG_CLASSES` e `fearGreedClass(c)`: nome e cor de cada zona. Zona desconhecida fica sem nome e com cor neutra.
  - `alignFearGreed(points, rows)`: encaixa o valor diário nas velas e devolve `{ values, classes }`.
- `PriceChartPanel.js`:
  - flag `view.showFng` (`priceChartFearGreed`) e dados em `view.fng`;
  - `fearGreedForChart()` devolve os dados, `PANE_LOADING` (painel vazio com spinner) ou `null`, e dispara `loadFearGreed()` quando não há dados ou eles têm mais de 10 min (`FNG_CACHE_MS`);
  - `loadFearGreed()` carrega **uma vez para todas as moedas e velas**. Numa recarga, os dados que estão na tela continuam até os novos chegarem; se a recarga falhar, ficam os que já estavam;
  - `updateFearGreedAvailability()` atualiza o checkbox: "Carregando Fear & Greed..." na primeira carga e "Fear & Greed Index: indisponível" quando a fonte não respondeu (a mensagem do erro vai no `title`);
  - `render()` envia `fearGreed: fearGreedForChart()`;
  - o Atualizar do topo (`refreshLayers`) recarrega o painel ligado e zera os dados do desligado.
- `chart/createChart.js`: soma 1 em `--sub-panes` e chama `futures.setFearGreed(opts.fearGreed || null)`.
- `chart/futuresPanes.js`:
  - `createFngSeries` cria uma `LineSeries` com `autoscaleInfoProvider` fixo em 0–100 e as três linhas de referência. As margens da escala (6%, `FNG_MARGINS`) são aplicadas por `syncPriceScales()` via `scaleMarginsOf`, como as do [RSI](rsi.md) (não aplique `scaleMargins` direto no `priceScale()`);
  - `setFearGreed(data)` liga e desliga o painel por `withFuturesMoved` (os de futuros saem e voltam depois dele);
  - `drawFng` só refaz os dados quando mudam as velas, a resposta ou a série. Cada ponto leva a cor da sua zona (`color` do dado da linha);
  - quando muda um painel **antes** dele (volume, CVD, RSI, MACD ou liquidações), `withTailMoved(fn)` tira o Fear & Greed junto com os de futuros e o recoloca, redesenhado. Ver [paineis-de-futuros](paineis-de-futuros.md).

## Regras de negócio e fórmulas

`alignFearGreed` dá a cada vela **o último valor publicado até o fim dela**:

| Vela | Valor mostrado |
|---|---|
| D | o do dia |
| S e M | o do último dia da vela (na vela em andamento, o de hoje) |
| 1h e 4h | o do dia, repetido em todas as velas dele (a linha vira degraus) |

- Dia sem valor na fonte repete o anterior (há alguns buracos no histórico de 2018).
- Velas anteriores ao primeiro valor (fev/2018) ficam vazias.
- **Fonte parada:** se o último valor publicado tiver mais de 2 dias (`STALE_MS`), as velas depois disso ficam vazias em vez de repetir um valor velho.

## Cache e estado persistido

- `priceChartFearGreed`: `"1"` ou `"0"`, desligado por padrão.
- Server: `fearGreed`, 10 min. Página: `view.fng`, 10 min (`FNG_CACHE_MS`).
- A altura do painel, se a divisória for arrastada, fica em `priceChartPaneHeights.fng`.

## Casos de borda e armadilhas

- O painel **não muda ao trocar de moeda**: é o esperado, o índice é do mercado.
- O índice é um valor por dia: em 1h e 4h não existe leitura intradiária.
- A Alternative.me é um serviço de terceiros e gratuito, sem garantia de disponibilidade. Fora do ar, o checkbox avisa "indisponível" e o resto do gráfico segue normal.
- Com a página aberta por vários dias, o valor novo aparece no próximo `render()` depois de vencidos os 10 min do cache (mexer no gráfico, trocar de moeda ou clicar em Atualizar).

## Checklist ao alterar

- Mudou a leitura da resposta da API: ajuste `test/server/fearGreed.test.js`.
- Mudou o encaixe nas velas ou as zonas: ajuste `test/public/fearGreed.test.js` e as tabelas deste doc.
- Mudou o formato de `/fear-greed`: ajuste [api.md](../../referencia/api.md#get-fear-greed).

## Como verificar

1. Em BTC D, ligue "Fear & Greed Index": o painel aparece abaixo do Volume, com a linha colorida e o título "Fear & Greed <valor> <zona> fonte: alternative.me". Compare o valor de hoje com o do site da Alternative.me.
2. Passe a mira: o título mostra o valor e a zona de cada dia.
3. Com "Open interest (futuros)", "RSI" e "Liquidações" ligados, a ordem fica Volume, RSI, Liquidações, Fear & Greed, Open interest. Desligue e religue cada um (inclusive o Volume): a ordem se mantém e nenhum painel fica vazio.
4. Troque para a vela S e depois para 4h: em 4h a linha vira degraus de um dia.
5. Troque de moeda: o painel continua igual, sem nova chamada a `/fear-greed` (aba Rede do navegador).
6. Recarregue a página: o painel continua ligado.

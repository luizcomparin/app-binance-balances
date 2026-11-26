---
titulo: Sinais — planejamento e andamento
resumo: Etapas da v1 dos sinais com marcação de concluído, pendências de decisão, preparos para a v2 (varredura, cache compartilhado, backtest) e ideias futuras.
arquivos: []
rotas: []
eventos: []
storage: []
---

# Planejamento dos sinais

Como usar este doc: ao concluir uma etapa, marque os itens (`[x]`), anote a data e o que mudou em relação ao plano, e atualize o [README](README.md) e o [catálogo](catalogo-de-sinais.md) no mesmo commit do código.

**Situação em 26/11/2026:** etapas 0 a 4 concluídas. O campo "Sinais" está no cabeçalho do gráfico com tendência, MACD, RSI, esticagem, Fear & Greed, funding e liquidações; faltam a divergência de RSI (etapa 5) e o fechamento (etapa 6).

## V1: sinais no gráfico de preço

Cada etapa termina com algo utilizável, `npm test` passando e docs atualizados.

### Etapa 0 — Levantamento e documentação ✅ (25/11/2026)

- [x] Levantar os indicadores e camadas existentes e o histórico disponível em cada fonte.
- [x] Definir escopo (D e S), interface (campo resumido + janela flutuante) e limiares fixos.
- [x] Criar esta documentação (`docs/sinais/`).

### Etapa 1 — Núcleo puro: tendência, RSI e esticagem ✅ (25/11/2026)

- [x] Módulo puro `public/components/price-chart/signals/signals.js`, com o formato do resultado descrito no [README](README.md#arquitetura).
- [x] Sinais `trend-ma-d`, `trend-ma-w`, `rsi-d`, `rsi-w`, `stretch-d`, `stretch-w`.
- [x] Funções auxiliares: contagem de velas seguidas (`streak`), percentil no histórico (`percentileRank`), mínimo de amostras.
- [x] Tratamento da vela em andamento: o valor e o "ativo" usam a última vela; "há N velas" conta só as fechadas (`forming`).
- [x] Placar de região (`regionOf`).
- [x] Testes em `test/public/signals.test.js`.

Mudanças em relação ao plano: a esticagem só vira sinal de fundo com o preço abaixo da média (e de topo, acima); o texto de cada sinal (`text`) já sai pronto do núcleo, em PT-BR. A conferência com velas reais da Binance foi feita na etapa 2.

### Etapa 2 — Dados D/S e interface ✅ (25/11/2026)

- [x] Carga das velas `1d` (até 3 páginas) e `1w` por moeda, independente da vela na tela, com proteção contra troca de moeda no meio (`signals/signalsPanel.js`).
- [x] Campo resumido no cabeçalho (ao lado de `#price-chart-info`) com estado de carregando e de erro.
- [x] Janela flutuante com os detalhes; fecha com clique fora e Esc.
- [x] Recarregar no "Atualizar" do topo e ao trocar de moeda.
- [x] Verificação na aba do gráfico; seção "Como verificar" no README.

Verificado com o server local e o Edge sem interface: sinais de BTC, ETH, XRP, SUI e USDT com velas reais; campo e janela em BTC e USDT; troca de moeda; fechar com Esc e com clique fora. **Não verificado:** o estado de erro de carga (não foi simulada uma falha) e o Atualizar do topo com a janela aberta.

Ajuste feito ao ver dados reais: o percentil da esticagem é arredondado para baixo no texto (um valor perto do máximo aparecia como "acima de 100% do histórico" sem ser o máximo).

### Etapa 3 — Fear & Greed e MACD ✅ (25/11/2026)

- [x] Sinal `fng` (`fearGreedSignal`), com a carga de `/fear-greed` no painel dos sinais.
- [x] Sinais `macd-w` e `macd-d` (`macdSignal`).
- [x] Testes.

Mudanças em relação ao plano: a ganância extrema começa em 76 (zona da Alternative.me), não em 75; o painel dos sinais tem cache próprio do Fear & Greed (10 min) em vez de dividir o do painel do gráfico, para não acoplar os dois módulos.

Verificado com o server local e o Edge sem interface, em BTC: os dois MACD e o Fear & Greed aparecem na janela, e o valor do Fear & Greed (11) bate com o de `/fear-greed`. **Não verificado:** a fonte do Fear & Greed fora do ar (não foi simulada) e a comparação visual do MACD com o painel do gráfico.

### Etapa 4 — Funding e liquidações (fontes opcionais) ✅ (26/11/2026)

- [x] Sinal `funding` (`fundingSignal`, `/futures-data?period=1d`).
- [x] Sinal `liq` (`liquidationSignal`, `/liquidations` em D).
- [x] Estado "indisponível" com motivo: sem perpétuo, sem chave da Coinalyze, chave recusada, erro, pouco histórico.
- [x] Reagir a `COINALYZE_KEY_CHANGED`.
- [x] Consumo de chamadas da Coinalyze: cache de 30 min por moeda no painel dos sinais (mais os 5 min do server). Cada moeda nova custa uma chamada por corretora (3); abrir mais de ~12 moedas novas no mesmo minuto ainda pode estourar o limite, e aí o sinal fica indisponível até a próxima carga.
- [x] Testes.

Mudanças em relação ao plano:
- o funding só é fundo com a média negativa (e baixa), não com "percentil ≤ 10 ou negativa";
- as liquidações são comparadas com os últimos 2 anos, não com todo o histórico;
- o histórico do funding é de cerca de 166 dias, não 333 (a rota devolve 500 cobranças; ver B15 em [debitos-tecnicos](../debitos-tecnicos.md));
- os extremos passaram a ser decididos com os empates contando pela metade (`midRank`), também na esticagem: o funding fica muito tempo parado no mesmo valor, e sem isso um valor empatado no teto não contava como topo.

Verificado com o server local e o Edge sem interface: BTC (funding neutro, cascata de longs ativa), SUI (funding negativo ativo) e USDT (funding sem contrato perpétuo). **Não verificado:** os estados sem chave e de chave recusada da Coinalyze e a reação a `COINALYZE_KEY_CHANGED` na tela (a chave não foi removida para testar; os textos estão cobertos nos testes do núcleo), e o limite da Coinalyze estourado.

### Etapa 5 — Divergência de RSI

- [ ] Definir pivôs e janela; sinais `rsi-div-d` e `rsi-div-w`.
- [ ] Testes com séries montadas à mão.

### Etapa 6 — Fechamento da v1

- [ ] Revisar limiares e a regra do placar olhando moedas reais (BTC, ETH e duas altcoins).
- [ ] Atualizar os docs de referência que se aplicarem: [armazenamento-local](../referencia/armazenamento-local.md), [cache](../referencia/cache.md), [glossario](../referencia/glossario.md), cabeçalhos YAML e `node docs/verificar-cobertura.mjs`.
- [ ] Decidir o que entra em seguida (pendências abaixo e candidatos do catálogo).

## Pendências de decisão

- **Estatística "o que aconteceu depois"** (explicada abaixo): entra na v1, depois da etapa 6, ou junto com o backtest da v2? Em aberto desde 25/11/2026.

### O que é a estatística "o que aconteceu depois"

Para cada sinal, olhar no histórico da própria moeda todas as vezes em que ele ativou e medir o que o preço fez em seguida. Exemplo de como apareceria na janela:

> **RSI diário ≤ 30** — ativou 14 vezes desde 2019. Depois de 30 dias o preço estava mais alto em 10 delas (71%), com variação mediana de +12%. Depois de 90 dias: 11 de 14 (79%), mediana de +31%. Pior caso em 30 dias: −22%.

Para que serve: em vez de confiar que "RSI abaixo de 30 é fundo", a pessoa vê quantas vezes isso funcionou **nesta moeda**. Um sinal que acertou 5 de 14 vezes merece menos peso que um que acertou 12 de 14.

Custo: baixo, porque o histórico já estará carregado para os percentis. Cuidados: poucas ocorrências não provam nada (mostrar sempre o número de vezes), ativações seguidas contam como uma só, e o resultado passado não garante o futuro.

É a versão pequena, por sinal e por moeda, do backtest registrado abaixo.

## Preparos para a v2

Nada disto é feito na v1, mas a v1 deve ser escrita de modo a não atrapalhar.

### Tela de varredura

Uma tela própria que varre todos os ativos (carteira e watchlist, ou uma lista escolhida), analisa cada um e mostra quais apresentam mais sinais, com ordenação por placar.

- O cálculo vai para o **server**: rota própria, fila respeitando os limitadores e cache longo. Como a vela diária fecha uma vez por dia, um cache de horas resolve.
- O gargalo é a Coinalyze (~40 chamadas/min, uma por símbolo e corretora). A varredura precisa funcionar também sem ela, com os sinais opcionais marcados como indisponíveis.
- **Requisito já na v1:** o núcleo dos sinais não pode depender de DOM, de `window` nem de `fetch`, para o server importá-lo direto (o projeto é ESM).

### Reaproveitar a análise feita no gráfico de preço

Ideia registrada em 25/11/2026: ao analisar uma moeda na tela do gráfico de preço, **já gravar o resultado no histórico da varredura e renovar o cache daquela moeda**, para poupar consultas quando a varredura rodar.

- Implica um armazenamento compartilhado entre as duas telas, com resultado e horário por moeda. Onde fica (memória do server, arquivo local, `localStorage`) é decisão da v2.
- A varredura pula as moedas com análise recente e só busca as vencidas.
- **Requisito já na v1:** o resultado ter `asset` e `generatedAt` e ser serializável em JSON (já previsto no formato).

### Backtest dos sinais

Intenção registrada em 25/11/2026: avaliar os sinais no histórico para saber quais valem a pena.

- Medir, por sinal e por combinação de sinais, o que o preço fez depois (7, 30, 90 dias): taxa de acerto, retorno mediano, pior caso.
- Comparar com a linha de base (comprar em um dia qualquer), senão um sinal parece bom só porque o mercado subiu.
- Usar para calibrar limiares, dar peso aos sinais no placar e descartar os que não funcionam.
- Cuidados: não usar dado do futuro no cálculo de cada dia (os percentis devem considerar só o histórico até aquela data), poucas ocorrências, e ajuste excessivo a uma moeda.
- **Requisito já na v1:** cada sinal ser calculável para uma data passada com as velas até ela, isto é, funções que recebem as séries e não leem o "agora".

## Ideias futuras

- **4h e Mensal** como refinamento, numa visão alternativa (o 4h para o momento de entrada; o mensal tem poucas velas na maioria das altcoins).
- **Limiares configuráveis** por engrenagem (níveis do RSI, percentis, médias da esticagem, janela das liquidações).
- **Sinais candidatos** listados no [catálogo](catalogo-de-sinais.md#candidatos-para-depois-da-v1).
- **Selo na watchlist** com a região de cada moeda (depende da varredura ou do cache compartilhado).
- **Marcar no gráfico** os pontos do passado em que um sinal ativou.
- **Pesos por sinal** no placar, definidos pelo backtest.
- **OI e long/short** como sinais, se o OI agregado com histórico longo da Coinalyze for adotado (ver [ideias-futuras](../backlog/ideias-futuras.md)).

## Registro de andamento

| Data | O que foi feito |
|---|---|
| 25/11/2026 | Levantamento dos indicadores e camadas, decisões iniciais e criação da documentação (etapa 0) |
| 26/11/2026 | Etapa 4: sinais de funding e de liquidações reais (fontes opcionais), com cache próprio e reação à troca da chave da Coinalyze |
| 25/11/2026 | Etapa 3: sinais de MACD (D e S) e Fear & Greed |
| 25/11/2026 | Etapa 2: carga das velas D e S, campo "Sinais" no cabeçalho do gráfico e janela flutuante com os detalhes |
| 25/11/2026 | Etapa 1: núcleo puro (`signals/signals.js`) com tendência por médias, RSI, esticagem com percentil e placar de região, com testes |

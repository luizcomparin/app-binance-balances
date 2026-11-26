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

**Situação em 25/11/2026:** etapa 0 concluída; nenhuma linha de código dos sinais escrita.

## V1: sinais no gráfico de preço

Cada etapa termina com algo utilizável, `npm test` passando e docs atualizados.

### Etapa 0 — Levantamento e documentação ✅ (25/11/2026)

- [x] Levantar os indicadores e camadas existentes e o histórico disponível em cada fonte.
- [x] Definir escopo (D e S), interface (campo resumido + janela flutuante) e limiares fixos.
- [x] Criar esta documentação (`docs/sinais/`).

### Etapa 1 — Núcleo puro: tendência, RSI e esticagem

- [ ] Módulo puro com o formato do resultado descrito no [README](README.md#arquitetura-planejada).
- [ ] Sinais `trend-ma-d`, `trend-ma-w`, `rsi-d`, `rsi-w`, `stretch-d`, `stretch-w`.
- [ ] Funções auxiliares: contagem de velas seguidas, percentil no histórico, mínimo de amostras.
- [ ] Definir o tratamento da vela em andamento (fechada × em formação).
- [ ] Placar de região.
- [ ] Testes em `test/public/`.

### Etapa 2 — Dados D/S e interface

- [ ] Carga das velas `1d` (até 3 páginas) e `1w` por moeda, independente da vela na tela, com proteção contra troca de moeda no meio.
- [ ] Campo resumido no cabeçalho (ao lado de `#price-chart-info`) com estado de carregando e de erro.
- [ ] Janela flutuante com os detalhes; fecha com clique fora e Esc.
- [ ] Recarregar no "Atualizar" do topo e ao trocar de moeda.
- [ ] Verificação manual na aba do gráfico; seção "Como verificar" no README.

### Etapa 3 — Fear & Greed e MACD

- [ ] Sinal `fng` (reaproveitando a carga única de `/fear-greed`).
- [ ] Sinais `macd-w` e `macd-d`.
- [ ] Testes.

### Etapa 4 — Funding e liquidações (fontes opcionais)

- [ ] Sinal `funding` (`/futures-data?period=1d`).
- [ ] Sinal `liq` (`/liquidations` em D).
- [ ] Estado "indisponível" com motivo: sem perpétuo, sem chave da Coinalyze, erro, pouco histórico.
- [ ] Reagir a `COINALYZE_KEY_CHANGED`.
- [ ] Conferir o consumo de chamadas (Coinalyze ~40/min) ao trocar de moeda várias vezes.
- [ ] Testes.

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

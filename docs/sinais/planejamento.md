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

**Situação em 26/11/2026:** v1 concluída (etapas 0 a 6), mais o rótulo "Sobrecomprado" e a estatística "o que aconteceu depois". Fica a decisão sobre o peso dos sinais fortes (pendências abaixo) e a v2.

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

### Etapa 5 — Divergência de RSI ✅ (26/11/2026)

- [x] Pivôs e janela definidos (ver o [catálogo](catalogo-de-sinais.md)); sinais `rsi-div-d` e `rsi-div-w` (`rsiDivergenceSignal`).
- [x] Testes com séries montadas à mão.

Verificado com velas reais: no momento não há divergência em BTC, ETH, XRP, SUI, SOL, LINK, AAVE e NEAR (os preços vêm fazendo mínimas novas), e a janela mostra "nenhuma recente" nas duas linhas. Para ver o sinal ativar, o passado foi varrido dia a dia: no BTC diário foram 14 divergências em 1100 velas (ativo em cerca de 12% delas) e 8 no semanal em 300 velas; ETH e SOL ficaram em 13 e 11 no diário. Isso só confirma que a detecção funciona e não dispara o tempo todo; **não é backtest** nem diz se o sinal acerta. **Não verificado:** o sinal ativo na tela (não há nenhum ativo agora) e a comparação visual dos pivôs com o gráfico.

### Etapa 6 — Fechamento da v1 ✅ (26/11/2026)

- [x] Revisar limiares e a regra do placar olhando moedas reais (BTC, ETH, SOL, XRP e LINK).
- [x] Docs de referência, cabeçalhos YAML e `node docs/verificar-cobertura.mjs`.
- [x] O que entra em seguida: ficou como recomendação abaixo, à espera de decisão.

O que foi feito:
- Varredura do passado de BTC, ETH, SOL, XRP e LINK (2020 a 2026), dia a dia e sem dado do futuro. Resultado completo em [calibracao.md](calibracao.md).
- **Regra do placar trocada para famílias de sinais** (3 ou mais famílias de um lado, no máximo 1 do outro). Com sinais soltos, "fundo provável" não se distinguia de um dia qualquer.
- **Limiares mantidos.** Uma versão mais exigente (Fear & Greed 15/85, liquidações no percentil 95) foi testada e não trouxe ganho claro.
- A janela passou a mostrar os sinais de fundo/topo separados por família.
- Docs de referência: [glossario](../referencia/glossario.md) com os termos dos sinais; [cache](../referencia/cache.md), [api](../referencia/api.md) e [eventos-e-estado](../referencia/eventos-e-estado.md) já tinham sido atualizados nas etapas 3 e 4; os sinais não usam `localStorage`.

Verificado: `npm test`, cobertura dos docs e a janela em BTC no Edge sem interface. **Não verificado:** uma moeda com região de topo na tela (não há nenhuma agora).

**Recomendação para a sequência**, nesta ordem:
1. Decidir o rótulo "Topo provável" (pendência abaixo): é a única leitura da tela que o histórico contradiz.
2. Backtest (v2), começando pela estatística "o que aconteceu depois" por sinal e por moeda: a varredura mostrou que os sinais valem muito diferente entre si, e isso merece aparecer na janela.
3. Só depois, novos sinais do catálogo e a tela de varredura.

### Depois da v1

#### Rótulo "Sobrecomprado" e estatística "o que aconteceu depois" ✅ (26/11/2026)

- [x] Região de topo renomeada para "Sobrecomprado" (decisão de 26/11/2026).
- [x] Estatística "o que aconteceu depois" por sinal e por moeda, e para a região, na janela (`signals/signalHistory.js`), com a linha de base.
- [x] Testes em `test/public/signalHistory.test.js`.
- [x] Análise de formas de dar mais peso aos sinais fortes: ver [calibracao.md](calibracao.md#pesos-para-os-sinais-fortes-análise). Nada foi implementado; a escolha está nas pendências.

Verificado: `npm test`; a conta com velas reais de BTC (2939 dias em cerca de 2 s) e SUI; a janela em BTC no Edge sem interface, com as linhas de histórico dos três sinais ativos, a da região e a linha de base. **Não verificado:** a janela enquanto a conta roda (o estado "Calculando..."), a troca de moeda no meio da conta na tela, e uma moeda em "Sobrecomprado".

## Pendências de decisão

- **Peso para os sinais fortes.** A análise ([calibracao.md](calibracao.md#pesos-para-os-sinais-fortes-análise)) não sustenta pesos numéricos; o que se sustentou foi a força dos sinais semanais de RSI. Recomendação: um segundo nível, "Fundo forte", quando a região de fundo provável inclui RSI semanal sobrevendido ou divergência de alta semanal. Aguardando decisão desde 26/11/2026.
- ~~Rótulo "Topo provável"~~: decidido em 26/11/2026, virou "Sobrecomprado".
- ~~Estatística "o que aconteceu depois"~~: implementada em 26/11/2026 (a explicação original segue abaixo).

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
| 26/11/2026 | Rótulo "Sobrecomprado" no lugar de "Topo provável"; estatística "o que aconteceu depois" na janela; análise de pesos para os sinais fortes |
| 26/11/2026 | Etapa 6: varredura histórica de 5 moedas, placar por famílias de sinais, sinais agrupados por família na janela e fechamento da v1 |
| 26/11/2026 | Etapa 5: sinal de divergência entre o preço e o RSI (D e S). Com ele, todos os sinais da v1 estão implementados |
| 26/11/2026 | Etapa 4: sinais de funding e de liquidações reais (fontes opcionais), com cache próprio e reação à troca da chave da Coinalyze |
| 25/11/2026 | Etapa 3: sinais de MACD (D e S) e Fear & Greed |
| 25/11/2026 | Etapa 2: carga das velas D e S, campo "Sinais" no cabeçalho do gráfico e janela flutuante com os detalhes |
| 25/11/2026 | Etapa 1: núcleo puro (`signals/signals.js`) com tendência por médias, RSI, esticagem com percentil e placar de região, com testes |

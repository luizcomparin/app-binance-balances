---
titulo: Ferramentas de desenho e régua de medição
resumo: Linha de tendência, raio, horizontal, retângulo, canal paralelo e medição de preço, salvos por moeda; régua temporária com Shift+clique mostrando variação, velas, tempo e volume.
arquivos: [public/components/price-chart/chart/drawings.js, public/components/price-chart/chart/drawingToolbar.js, public/components/price-chart/chart/measureTool.js, public/components/price-chart/chart/createChart.js]
rotas: []
eventos: []
storage: [price-chart-drawings, price-chart-drawings-visible, price-chart-draw-toolbar]
---

# Desenhos e régua

## Desenhos (`chart/drawings.js`)

Ferramentas (`TOOLS`):

| Ferramenta | Cliques |
|---|---|
| `trend` (linha de tendência) | 2 |
| `ray` (raio) | 2 |
| `hline` (linha horizontal) | 1 |
| `rect` (retângulo) | 2 |
| `channel` (canal paralelo) | 3 (2 pontos + deslocamento `dp`) |
| `measure` (medição de preço) | 2 |

Uso:

- Escolha a ferramenta na barra; cada clique marca um ponto. Terminado o desenho, a ferramenta volta ao cursor (como no TradingView).
- **Olho** (início da barra, `.lwc-draw-eye`): exibe/oculta todos os desenhos da moeda (inclusive as etiquetas das linhas horizontais no eixo). Ocultos, não dá para selecionar nem arrastar, e a seleção é desfeita (o Del não apaga o que não se vê). Escolher uma ferramenta volta a exibir. O estado fica em `price-chart-drawings-visible` (`drawings.setVisible` / `isVisible`, avisado à barra por `onVisibleChange`). A régua do Shift não é afetada.
- Clicar num desenho seleciona. Arrastar pelo corpo move; arrastar pelas bolinhas edita.
- **Del/Backspace** apaga o selecionado (ignorado dentro de inputs). **Esc** cancela o desenho em andamento ou tira a seleção.
- Depois do primeiro ponto de um desenho, **botão direito**, **Esc** ou **Del/Backspace** cancelam o desenho em andamento (sem apagar o selecionado) e a ferramenta volta ao cursor (`drafting()` em `drawings.js`).
- Os pontos são guardados como `{ ms, price }` (instante, não índice). Por isso valem em qualquer tamanho de vela e não se deslocam quando o histórico antigo carrega. Antes ou depois dos dados, o índice é extrapolado pela duração da vela.
- O desenho é feito num primitive anexado à série principal (`drawings.primitive`).
- **Medição de preço** (`measure`): é a mesma régua do Shift + clique, só que durável (salva, selecionável, arrastável e apagável como os outros desenhos). Usa `measureLines` e `paintMeasure` de `measureTool.js`. O texto (variação, barras, tempo, volume) é recalculado a cada desenho, então reflete o tamanho de vela atual. Para selecionar, clique dentro da área.
- A etiqueta de preço no eixo de cada linha horizontal é uma **linha de preço nativa invisível** (`createPriceLine` com `lineVisible: false`), mantida por `syncAxisLabels()`: criada, movida (ao arrastar) e removida junto com o desenho, e recriada na série nova quando o modo Linha/Velas muda (no `attached` do primitive).
  - **Não use `priceAxisViews` no primitive.** O Lightweight Charts 5.0.8 não encaixa essas etiquetas no arranjo que afasta as etiquetas sobrepostas, e com elas presentes as outras (ordens abertas, preços médios, médias) iam parar empilhadas no topo do eixo, longe das suas linhas. O problema aparecia só nas moedas com linhas horizontais desenhadas.
- `createDrawings(chart, { container, getSeries, getPoints, getInterval, isBusy, onToolChange, onVisibleChange })` devolve `{ primitive, setTool, setVisible, isVisible, move(param), setAsset(asset) }`.

**Barra** (`chart/drawingToolbar.js`): flutua sobre o gráfico e pode ser arrastada pela alça. A posição fica em `price-chart-draw-toolbar`. `createDrawingToolbar(wrap, onSelect, onToggleVisible)` devolve `{ setActive, setVisible }`.

**Persistência:** `price-chart-drawings` = `{ MOEDA: [desenhos] }`. Cada desenho é validado ao carregar (`validDrawing`).

## Régua (`chart/measureTool.js`)

- **Shift + clique** marca o início, o mouse estica a área, um clique fixa a medida e o próximo clique apaga. **Esc** cancela. É temporária: para uma medida que fica, use a ferramenta "Medição de preço" da barra.
- `measureLines(pts, i1, i2, p1, p2, interval)` (texto, testada em `test/public/measureTool.test.js`) e `paintMeasure(scope, x1, y1, x2, y2, label)` (canvas) são exportadas e usadas também por `drawings.js`.
- Mostra a variação de preço (valor e %), o número de velas, o tempo (`formatSpan`) e o volume em USDT entre os pontos. Azul para alta, vermelho para queda.
- Os pontos ficam ancorados no tempo da vela (+ velas extras além das pontas).
- A régua em andamento tem **prioridade** sobre os desenhos nos cliques (`isBusy`). Trocar o tamanho da vela limpa a medida.

## Integração (`createChart.js`)

- Os dois primitives são reanexados quando a série é recriada (troca Linha/Velas).
- No crosshair, `measure.move(param) || drawings.move(param)` esconde o tooltip enquanto se desenha ou mede.
- `clear()` limpa a régua e chama `drawings.setAsset(null)`.

## Casos de borda

- A tecla Esc também é tratada por vários outros listeners globais (modais, popovers, seletor). O handler da régua não ignora inputs.

## Como verificar

1. Desenhe um canal, troque a vela de D para 4h (o canal fica no lugar), troque de moeda e volte (o desenho foi salvo) e apague com Del.
2. Faça Shift+clique, mova o mouse e clique para medir; o próximo clique apaga a medida.
3. Escolha "Linha de tendência", clique no primeiro ponto e aperte o botão direito (de novo com Esc e com Del): a linha some, não abre o menu do navegador e a ferramenta volta ao cursor.
4. Escolha "Medição de preço" na barra, marque dois pontos: a medida fica. Troque de moeda e volte (continua lá), arraste pelas bolinhas e apague com Del.
5. Clique no olho da barra: todos os desenhos somem (e as etiquetas das horizontais no eixo); recarregue (continuam ocultos); escolha uma ferramenta: voltam a aparecer.

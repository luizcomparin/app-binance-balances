---
titulo: Configuração e segurança
resumo: Variáveis do .env, como as chaves são lidas, trocadas e gravadas, e as proteções do server local.
arquivos: [server/config.js, server.js, .env.example, .gitignore]
rotas: [POST /settings/api-key, POST /settings/coinalyze-key]
eventos: []
storage: []
---

# Configuração e segurança

## `.env`

O arquivo é lido por `process.loadEnvFile()` na **pasta atual** (`path.resolve(".env")`), então o server precisa ser iniciado da raiz do projeto. Se o arquivo não existir, `loadEnvFile` lança erro e o server não sobe.

| Variável | Obrigatória | Uso |
|---|---|---|
| `PORT` | **sim** (1–65535, senão `process.exit(1)`) | Porta do Express. Também entra na lista do CORS e do `sameOriginJson` |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | não (sem elas, a página abre as Configurações) | Endpoints assinados. Formato `/^[A-Za-z0-9]{16,128}$/` |
| `COINALYZE_API_KEY` | não | Painel de liquidações reais. Formato `/^[A-Za-z0-9-]{16,128}$/` |

**Agentes: não leiam nem exibam o `.env`.** Ele tem as chaves reais da conta.

## Ciclo de vida das chaves

1. Ao subir, `config.js` lê as chaves do `process.env` e as guarda em memória (`credentials`, `coinalyzeKey`).
2. Ao trocar pelo dashboard (ver [configuracoes](../funcionalidades/configuracoes.md)):
   - a chave nova é **testada** na API;
   - `setCredentials`/`setCoinalyzeKey` troca a chave em memória, valendo na hora;
   - `clearCache()` (e, para a Binance, `clearTradesCache()`) descarta os dados da conta anterior;
   - a resposta HTTP é enviada;
   - `res.on("finish")` grava a chave no `.env` com `saveEnvVars`, que preserva as outras linhas e o EOL. Em `npm run dev`, o nodemon reinicia o server ao ver o `.env` mudar, e por isso a gravação fica para depois da resposta.
3. Os padrões de formato também impedem quebras de linha que corromperiam o `.env`.

## Proteções

- **Somente leitura:** o app só faz GET na Binance. Ao salvar a chave, `apiRestrictions` gera avisos se ela puder sacar ou negociar, recomendando criar uma só com "Habilitar leitura".
- **O secret nunca volta para o navegador.** As rotas de status devolvem só `configured` e `keyHint` (os 4 últimos caracteres). O modal limpa o campo do secret ao fechar e ao salvar.
- **CORS** (`server.js`): só aceita origem `http://localhost:<PORT>` e `http://127.0.0.1:<PORT>`. Requisições sem `Origin` passam (curl e mesma origem).
- **`sameOriginJson`** (POST de configurações): se houver `Origin`, ela precisa ser do dashboard, e o `Content-Type` precisa ser `application/json` (o navegador exige a pré-checagem de CORS, então outro site não consegue enviar). Limite do corpo: 2 kb.
- **Validação de entrada** nas rotas (`:asset`, `interval`, `period`), o que impede injetar parâmetros nas URLs da Binance.
- **Só no próprio computador:** o Express escuta apenas em `127.0.0.1` e `::1`, e o livereload (só em dev) em `localhost`. Outras máquinas da rede não alcançam a API. **Não troque por `0.0.0.0`.**
- **Ponto a observar:** `GET /raw` expõe o JSON cru da conta a qualquer programa local que não mande `Origin`.

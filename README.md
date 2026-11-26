# Binance Balances

Dashboard local e somente leitura da sua conta Binance: carteira, P&L por moeda, ordens e gráfico de preço. Roda no seu computador e só aceita conexões dele.

## Requisitos

- **Node.js 20.12 ou mais novo** (testado no 22). Confira com `node -v`.
- **npm**: o que vem junto com o Node já serve.
- **Chave de API da Binance** (API Key + Secret Key), só com a permissão **"Habilitar leitura"**. Sem ela o dashboard abre, mas não mostra os dados da conta.
- **Chave de API da Coinalyze**: opcional e gratuita. Só é usada pelo painel de liquidações reais do gráfico de preço.

## Como rodar

1. **Instale as dependências**, na pasta do projeto:

   ```bash
   npm install
   ```

   - Se der erro, apague a pasta `node_modules` e rode `npm install` de novo.
   - No PowerShell, se aparecer "a execução de scripts foi desabilitada neste sistema", rode o comando pelo CMD ou use `npm.cmd install`.

2. **Crie o arquivo `.env`** copiando o `.env.example`:

   ```bash
   copy .env.example .env      # Windows (CMD)
   cp .env.example .env        # PowerShell, Linux ou macOS
   ```

   Só a `PORT` é obrigatória (o exemplo já vem com `3000`). As chaves podem ficar vazias: você informa depois pela própria página (passo 5).

3. **Suba o server**, de um destes jeitos:

   | Comando | Quando usar |
   |---|---|
   | `npm start` | Uso normal |
   | `iniciar.bat` (dois cliques, Windows) | Mesmo que `npm start`. Fechar a janela desliga o server |
   | `npm run dev` | Para mexer no código: reinicia o server e recarrega a página ao salvar |

4. **Abra o endereço que aparece no terminal**: `http://localhost:3000/site` (troque `3000` pela sua `PORT`).

5. **Configure as chaves.** Sem chave da Binance, a tela de **Configurações** abre sozinha. Depois, ela fica na engrenagem (⚙) no topo.
   - Cole a API Key e a Secret Key da Binance e clique em **Testar e salvar**. A página recarrega já com os seus dados.
   - A chave da Coinalyze fica na mesma tela, mais abaixo.
   - Cada seção tem um passo a passo de como criar a chave ("Como criar a chave na…").
   - As chaves são gravadas no `.env` do seu computador. Nunca compartilhe nem faça commit desse arquivo.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `arquivo .env não encontrado` | Faltou o passo 2 |
| `defina PORT no .env com uma porta entre 1 e 65535` | Corrija a linha `PORT=` do `.env` |
| `process.loadEnvFile is not a function` | Node antigo: atualize para 20.12 ou mais novo |
| `EADDRINUSE` | A porta já está em uso: feche o outro programa (ou outra janela do server) ou troque a `PORT` no `.env` |
| A Binance recusa a chave ao salvar | Confira se copiou a API Key e a Secret Key inteiras, se "Habilitar leitura" está marcada e, se a chave tem restrição de IP, se o seu IP atual está na lista |
| A página não abre de outro computador ou do celular | É intencional: o server só responde no próprio computador |

## Para desenvolver

- `npm test` roda os testes automatizados.
- As regras do projeto e o mapa do código estão no [AGENTS.md](AGENTS.md). A documentação completa fica em [docs/](docs/README.md).

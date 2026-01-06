# 🐳 Deploy com Docker

## 📦 Build e Teste Local

### 1. Build da imagem

```bash
docker build -t binance-balances .
```

### 2. Rodar localmente

```bash
docker run -p 3000:3000 \
  -e BINANCE_API_KEY=sua_chave_aqui \
  -e BINANCE_API_SECRET=seu_secret_aqui \
  binance-balances
```

Acesse: http://localhost:3000/site

---

## ☁️ Deploy em Plataformas Cloud

### 🎯 **Render** (Recomendado - Grátis)

1. Acesse [render.com](https://render.com) e faça login
2. Clique em **New +** → **Web Service**
3. Conecte seu repositório GitHub
4. Configure:
   - **Name**: binance-balances
   - **Environment**: Docker
   - **Plan**: Free
5. Adicione as variáveis de ambiente:
   - `BINANCE_API_KEY`
   - `BINANCE_API_SECRET`
6. Deploy automático! ✅

**URL gerada**: `https://binance-balances.onrender.com/site`

---

### 🚂 **Railway** (Alternativa Grátis)

1. Acesse [railway.app](https://railway.app) e faça login
2. **New Project** → **Deploy from GitHub repo**
3. Selecione seu repositório
4. Railway detecta o Dockerfile automaticamente
5. Vá em **Variables** e adicione:
   - `BINANCE_API_KEY`
   - `BINANCE_API_SECRET`
6. Deploy automático! ✅

---

### ✈️ **Fly.io** (Via CLI)

```bash
# Instala CLI do Fly.io
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Login
fly auth login

# Cria app
fly launch

# Durante setup:
# - Nome do app: binance-balances
# - Region: escolha a mais próxima
# - Database: NO
# - Deploy: YES

# Adiciona secrets
fly secrets set BINANCE_API_KEY=sua_chave
fly secrets set BINANCE_API_SECRET=seu_secret

# Deploy
fly deploy
```

**URL gerada**: `https://binance-balances.fly.dev/site`

---

### ☁️ **Google Cloud Run** (Paga por Uso - Muito Barato)

```bash
# Instala Google Cloud SDK
# https://cloud.google.com/sdk/docs/install

# Login
gcloud auth login

# Configura projeto
gcloud config set project SEU_PROJETO_ID

# Build e push para Container Registry
gcloud builds submit --tag gcr.io/SEU_PROJETO_ID/binance-balances

# Deploy
gcloud run deploy binance-balances \
  --image gcr.io/SEU_PROJETO_ID/binance-balances \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars BINANCE_API_KEY=sua_chave,BINANCE_API_SECRET=seu_secret
```

---

## 🔒 Segurança

⚠️ **NUNCA comite o arquivo `.env` no git!**

Verifique se `.env` está no `.gitignore`:

```bash
git check-ignore .env
```

---

## 🚀 Comandos Úteis

```bash
# Build
docker build -t binance-balances .

# Run com arquivo .env
docker run -p 3000:3000 --env-file .env binance-balances

# Ver logs
docker logs <container_id>

# Parar container
docker stop <container_id>

# Remover imagem
docker rmi binance-balances
```

---

## 📊 Estimativa de Custos

| Plataforma    | Plano Grátis       | Preço após limite |
| ------------- | ------------------ | ----------------- |
| **Render**    | 750h/mês           | $7/mês            |
| **Railway**   | $5 crédito         | $5/mês (~100h)    |
| **Fly.io**    | 3 VMs grátis       | $1.94/mês         |
| **Cloud Run** | 2M requisições/mês | ~$0.10/dia        |

**Recomendação**: Comece com **Render** (mais simples) ou **Fly.io** (mais generoso).

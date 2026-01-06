# Multi-stage build para otimizar tamanho da imagem

# Estágio 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas package.json e package-lock.json para aproveitar cache
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --omit=dev

# Estágio 2: Produção
FROM node:20-alpine

WORKDIR /app

# Cria usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copia dependências do estágio anterior
COPY --from=builder /app/node_modules ./node_modules

# Copia código da aplicação
COPY --chown=nodejs:nodejs . .

# Muda para usuário não-root
USER nodejs

# Expõe a porta (será configurável via ENV)
EXPOSE 3000

# Variáveis de ambiente (sobrescrever no deploy)
ENV NODE_ENV=production
ENV PORT=3000

# Comando para iniciar
CMD ["node", "server.js"]

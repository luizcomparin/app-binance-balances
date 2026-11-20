// server.js — sobe o Express, serve o dashboard (public/) e registra as rotas da API.
// A lógica fica em server/: config, cliente da Binance, serviços e rotas.

import { PORT } from "./server/config.js"; // primeiro: carrega o .env e valida as chaves
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "url";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import { registerRoutes } from "./server/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();

// CORS restrito ao próprio dashboard local; requisições sem Origin (curl, mesma origem) seguem liberadas
app.use(
	cors({
		origin(origin, callback) {
			const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
			callback(null, !origin || allowed.includes(origin));
		},
	})
);

// ==================== LIVERELOAD ====================
// Escuta mudanças na pasta public e recarrega o navegador
const liveReloadServer = livereload.createServer({
	exts: ["js", "css", "html", "jpg", "png", "jpeg", "gif", "svg"], // extensões monitoradas
});
liveReloadServer.watch(PUBLIC_DIR);

// Injeta o script do livereload no HTML servido
app.use(connectLivereload());
// ====================================================

app.use(express.static(PUBLIC_DIR));
// Serve a pasta public inteira no caminho /site
app.use("/site", express.static(PUBLIC_DIR));

// Redireciona /site para o index.html automaticamente
app.get("/site", (req, res) => {
	res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Abas do dashboard na URL (/site/grafico-de-preco, /site/saldos...): também servem o index.html,
// e o front abre a aba correspondente
app.get("/site/:page", (req, res, next) => {
	if (!/^[a-z0-9-]+$/.test(req.params.page)) return next();
	res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

registerRoutes(app);

app.listen(PORT, () => {
	console.log(`🚀 API rodando em:
   • http://localhost:${PORT}/balances          (carteira filtrada)
   • http://localhost:${PORT}/raw               (dados crus da Binance)
   • http://localhost:${PORT}/positions         (preço médio e P&L por moeda)
   • http://localhost:${PORT}/orders            (ordens abertas agrupadas por ativo)
   • http://localhost:${PORT}/orders/:asset     (ordens abertas para ativo específico)
   • http://localhost:${PORT}/executed-orders   (ordens executadas)
   • http://localhost:${PORT}/price-chart/:asset (gráfico de preço, ?interval=1h|4h|1d|1w|1M ou ?range=...)
   • http://localhost:${PORT}/site              (dashboard com HTML/CSS/JS)
  `);
});

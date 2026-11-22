// server.js — sobe o Express, serve o dashboard (public/) e registra as rotas da API.
// A lógica fica em server/: config, cliente da Binance, serviços e rotas.

import { PORT } from "./server/config.js"; // primeiro: carrega o .env e valida as chaves
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "url";
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
// Só em desenvolvimento (`npm run dev` passa --livereload): escuta mudanças na pasta public e recarrega
// o navegador. Em `npm start` fica desligado (sem servidor extra na porta 35729 nem script injetado).
const LIVERELOAD = process.argv.includes("--livereload");
if (LIVERELOAD) {
	// importados só aqui: são dependências de desenvolvimento
	const { default: livereload } = await import("livereload");
	const { default: connectLivereload } = await import("connect-livereload");
	const liveReloadServer = livereload.createServer({
		exts: ["js", "css", "html", "jpg", "png", "jpeg", "gif", "svg"], // extensões monitoradas
	});
	liveReloadServer.watch(PUBLIC_DIR);

	// Injeta o script do livereload no HTML servido
	app.use(connectLivereload());
}
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

// Só no próprio computador (127.0.0.1 e ::1): outras máquinas da rede não alcançam a API, que expõe dados
// da conta. "localhost" pode resolver para ::1 ou 127.0.0.1, por isso escuta nos dois; sem IPv6, segue no IPv4.
app.listen(PORT, "127.0.0.1", () => {
	const base = `http://localhost:${PORT}`;
	console.log(`🚀 Dashboard: ${base}/site${LIVERELOAD ? "  (livereload ligado)" : ""}
API (só neste computador):
   • ${base}/balances                    carteira em USDT/BRL e variação 24h
   • ${base}/positions                   preço médio e P&L por moeda
   • ${base}/orders  ·  /orders/:asset   ordens abertas (todas / de uma moeda)
   • ${base}/executed-orders             ordens executadas
   • ${base}/order-history/:asset        histórico de ordens de uma moeda
   • ${base}/trade-history/:asset        histórico de trades de uma moeda
   • ${base}/price-chart/:asset          velas (?interval=1h|4h|1d|1w|1M [&before=ms])
   • ${base}/futures-data/:asset         open interest, long/short e funding (?period=1h|4h|1d)
   • ${base}/liquidation-map/:asset      mapa de liquidação estimado
   • ${base}/liquidations/:asset         liquidações reais via Coinalyze (?interval=...)
   • ${base}/settings/api-key            status da chave da Binance (POST troca)
   • ${base}/settings/coinalyze-key      status da chave da Coinalyze (POST troca)
   • ${base}/raw  ·  /avg-buy-prices     dados crus da conta / compatibilidade
`);
});
app.listen(PORT, "::1").on("error", () => {});

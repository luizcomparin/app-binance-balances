// Confere se todo arquivo de código (server.js, server/, public/) aparece no campo `arquivos:` do
// cabeçalho YAML de algum doc em docs/. Também avisa sobre caminhos citados nos docs que não existem mais.
// Uso (na raiz do projeto): node docs/verificar-cobertura.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => f === "server.js" || f.startsWith("server/") || f.startsWith("public/"));

function docsIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? docsIn(p) : e.name.endsWith(".md") ? [p] : [];
  });
}

const covered = new Map(); // arquivo -> docs que o citam
for (const doc of docsIn(path.join(root, "docs"))) {
  const header = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(doc, "utf8").replace(/\r\n/g, "\n"));
  const line = header && /^arquivos:\s*\[(.*)\]\s*$/m.exec(header[1]);
  if (!line) continue;
  for (const f of line[1].split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!covered.has(f)) covered.set(f, []);
    covered.get(f).push(path.relative(root, doc));
  }
}

const missing = tracked.filter((f) => !covered.has(f));
const stale = [...covered.keys()].filter((f) => !fs.existsSync(path.join(root, f)));

if (missing.length) console.log(`Arquivos sem doc (${missing.length}):\n  ${missing.join("\n  ")}`);
if (stale.length) console.log(`Caminhos citados nos docs que não existem (${stale.length}):\n  ${stale.join("\n  ")}`);
if (!missing.length && !stale.length) console.log(`OK: ${tracked.length} arquivos de código cobertos pela documentação.`);
process.exitCode = missing.length || stale.length ? 1 : 0;

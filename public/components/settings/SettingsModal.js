// Painel "Configurações" (engrenagem no topo): troca da chave da API da Binance.
// A chave vai para o servidor local, que testa na Binance e grava no .env; a página só recebe
// "configurada" e o final da chave (o secret nunca volta). Sem chave, o painel abre ao carregar.
import { fetchApiKeyStatus, saveApiKey } from "../../api/binance.js";

const $ = (id) => document.getElementById(id);

let configured = false;

function setMessage(text, kind = "") {
  const el = $("settings-message");
  if (!el) return;
  el.innerHTML = text;
  el.className = `settings-message ${kind}`;
  el.hidden = !text;
}

function renderStatus(status) {
  configured = !!status?.configured;
  const el = $("settings-status");
  if (!el) return;
  el.className = `settings-status ${configured ? "ok" : "missing"}`;
  el.textContent = configured
    ? `Chave configurada (termina em ${status.keyHint}). Para trocar, informe uma nova abaixo.`
    : "Nenhuma chave configurada. Informe a API Key e a Secret Key para carregar a sua carteira.";
}

export function openSettings() {
  const modal = $("settings-modal");
  if (!modal) return;
  modal.hidden = false;
  // sem chave: tutorial já aberto
  const tutorial = $("settings-tutorial");
  if (tutorial && !configured) tutorial.open = true;
  setMessage("");
  $("settings-api-key")?.focus();
}

export function closeSettings() {
  const modal = $("settings-modal");
  if (modal) modal.hidden = true;
  const secret = $("settings-api-secret");
  if (secret) secret.value = ""; // não deixa o secret parado no campo
}

async function onSubmit(e) {
  e.preventDefault();
  const apiKey = $("settings-api-key").value.trim();
  const apiSecret = $("settings-api-secret").value.trim();
  if (!apiKey || !apiSecret) {
    setMessage("Informe a API Key e a Secret Key.", "error");
    return;
  }
  const btn = $("settings-save");
  btn.disabled = true;
  btn.textContent = "Testando na Binance...";
  setMessage("");
  try {
    const result = await saveApiKey(apiKey, apiSecret);
    renderStatus(result);
    $("settings-api-secret").value = "";
    const warnings = (result.warnings || []).map((w) => `<br>⚠ ${w}`).join("");
    setMessage(`Chave salva e funcionando. Recarregando os dados...${warnings}`, warnings ? "warn" : "ok");
    // recarrega a página com a conta nova (com aviso de permissão, dá tempo de ler)
    setTimeout(() => location.reload(), warnings ? 6000 : 1500);
  } catch (err) {
    setMessage(err.message, "error");
    btn.disabled = false;
    btn.textContent = "Testar e salvar";
  }
}

/** Liga o painel e devolve se já há chave configurada (sem chave, já abre o painel) */
export async function initSettings() {
  $("settings-btn")?.addEventListener("click", openSettings);
  $("settings-close")?.addEventListener("click", closeSettings);
  $("settings-form")?.addEventListener("submit", onSubmit);
  $("settings-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "settings-modal") closeSettings(); // clique fora do painel
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("settings-modal")?.hidden) closeSettings();
  });
  $("settings-secret-toggle")?.addEventListener("click", (e) => {
    const input = $("settings-api-secret");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Ocultar" : "Mostrar";
    e.currentTarget.setAttribute("aria-pressed", String(show));
  });

  try {
    renderStatus(await fetchApiKeyStatus());
  } catch {
    renderStatus(null);
  }
  if (!configured) openSettings();
  return configured;
}

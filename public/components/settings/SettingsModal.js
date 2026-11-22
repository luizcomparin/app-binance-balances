// Painel "Configurações" (engrenagem no topo): troca da chave da API da Binance.
// A chave vai para o servidor local, que testa na Binance e grava no .env; a página só recebe
// "configurada" e o final da chave (o secret nunca volta). Sem chave, o painel abre ao carregar.
// Também a chave opcional da Coinalyze (liquidações reais no gráfico de preço).
import { fetchApiKeyStatus, fetchCoinalyzeKeyStatus, saveApiKey, saveCoinalyzeKey } from "../../api/binance.js";
import { COINALYZE_KEY_CHANGED, emit } from "../../core/events.js";

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

/** section: "coinalyze" abre já na chave da Coinalyze (com o passo a passo aberto se ainda não há chave) */
export function openSettings(section = null) {
  const modal = $("settings-modal");
  if (!modal) return;
  modal.hidden = false;
  setMessage("");
  setCoinalyzeMessage("");
  if (section === "coinalyze") {
    const tutorial = $("settings-coinalyze-tutorial");
    if (tutorial && !coinalyzeConfigured) tutorial.open = true;
    $("settings-coinalyze")?.scrollIntoView({ block: "start" });
    $("settings-coinalyze-key")?.focus();
    return;
  }
  // sem chave: tutorial já aberto
  const tutorial = $("settings-tutorial");
  if (tutorial && !configured) tutorial.open = true;
  $("settings-api-key")?.focus();
}

// ---- chave da Coinalyze (opcional) ----
let coinalyzeConfigured = false;

function setCoinalyzeMessage(text, kind = "") {
  const el = $("settings-coinalyze-message");
  if (!el) return;
  el.textContent = text;
  el.className = `settings-message ${kind}`;
  el.hidden = !text;
}

function renderCoinalyzeStatus(status) {
  coinalyzeConfigured = !!status?.configured;
  const el = $("settings-coinalyze-status");
  if (el) {
    el.className = `settings-status ${coinalyzeConfigured ? "ok" : "missing"}`;
    el.textContent = coinalyzeConfigured
      ? `Chave configurada (termina em ${status.keyHint}). Para trocar, informe uma nova abaixo.`
      : "Nenhuma chave configurada. Sem ela, o painel Liquidações do gráfico fica desligado.";
  }
  const remove = $("settings-coinalyze-remove");
  if (remove) remove.hidden = !coinalyzeConfigured;
}

async function submitCoinalyze(apiKey) {
  const btn = $("settings-coinalyze-save");
  const remove = $("settings-coinalyze-remove");
  btn.disabled = remove.disabled = true;
  btn.textContent = apiKey ? "Testando na Coinalyze..." : "Removendo...";
  setCoinalyzeMessage("");
  try {
    renderCoinalyzeStatus(await saveCoinalyzeKey(apiKey));
    $("settings-coinalyze-key").value = "";
    setCoinalyzeMessage(apiKey ? "Chave salva e funcionando." : "Chave removida.", "ok");
    emit(COINALYZE_KEY_CHANGED);
  } catch (err) {
    setCoinalyzeMessage(err.message, "error");
  } finally {
    btn.disabled = remove.disabled = false;
    btn.textContent = "Testar e salvar";
  }
}

function onCoinalyzeSubmit(e) {
  e.preventDefault();
  const apiKey = $("settings-coinalyze-key").value.trim();
  if (!apiKey) {
    setCoinalyzeMessage("Informe a chave da Coinalyze.", "error");
    return;
  }
  submitCoinalyze(apiKey);
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

  $("settings-coinalyze-form")?.addEventListener("submit", onCoinalyzeSubmit);
  $("settings-coinalyze-remove")?.addEventListener("click", () => submitCoinalyze(""));
  fetchCoinalyzeKeyStatus()
    .then(renderCoinalyzeStatus)
    .catch(() => renderCoinalyzeStatus(null));

  try {
    renderStatus(await fetchApiKeyStatus());
  } catch {
    renderStatus(null);
  }
  if (!configured) openSettings();
  return configured;
}

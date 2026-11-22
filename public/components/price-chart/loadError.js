// Erro de carga das abas abaixo do gráfico (Ordens abertas, Histórico de ordens, Histórico de trades):
// mesma mensagem nas três, com o motivo devolvido pelo servidor e um botão "Tentar de novo".

import { escapeHtml } from "../../core/dom.js";

/** what = "o histórico de trades", "as ordens abertas"...; message = motivo (opcional) */
export function loadErrorHtml(what, message) {
  const reason = message ? ` (${escapeHtml(message)})` : "";
  return `<p class="pco-empty pco-error">Não foi possível carregar ${what}${reason}.
    <button type="button" class="ghost pco-retry">Tentar de novo</button></p>`;
}

/**
 * Aviso acima de dados antigos: a atualização falhou e a lista é a da última carga que deu certo.
 * what = "as ordens abertas"...; message = motivo (opcional); at = ms da última carga boa
 */
export function staleNoticeHtml(what, message, at) {
  const reason = message ? ` (${escapeHtml(message)})` : "";
  const time = new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `<p class="pco-empty pco-error pco-stale">⚠ Não foi possível atualizar ${what}${reason}. Mostrando os dados de ${time}.
    <button type="button" class="ghost pco-retry">Tentar de novo</button></p>`;
}

/** Clique em "Tentar de novo" dentro de `el` chama retry() */
export function onLoadRetry(el, retry) {
  el?.addEventListener("click", (e) => {
    if (e.target.closest(".pco-retry")) retry();
  });
}

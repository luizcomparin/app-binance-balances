// Erro de carga das abas abaixo do gráfico (Ordens abertas, Histórico de ordens, Histórico de trades):
// mesma mensagem nas três, com o motivo devolvido pelo servidor e um botão "Tentar de novo".

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** what = "o histórico de trades", "as ordens abertas"...; message = motivo (opcional) */
export function loadErrorHtml(what, message) {
  const reason = message ? ` (${escapeHtml(message)})` : "";
  return `<p class="pco-empty pco-error">Não foi possível carregar ${what}${reason}.
    <button type="button" class="ghost pco-retry">Tentar de novo</button></p>`;
}

/** Clique em "Tentar de novo" dentro de `el` chama retry() */
export function onLoadRetry(el, retry) {
  el?.addEventListener("click", (e) => {
    if (e.target.closest(".pco-retry")) retry();
  });
}

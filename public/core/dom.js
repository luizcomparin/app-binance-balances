export function showLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
  }
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

export function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// Escapa texto vindo de fora (mensagens do servidor, nomes da API) antes de colocar em innerHTML
export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
  }
}

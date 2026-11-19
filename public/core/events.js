// Eventos da aplicação: quem carrega dados avisa, cada componente decide o que redesenhar.
// Evita um painel chamar direto as funções de render dos outros.

// Saldos carregados (detail = resposta de /balances)
export const BALANCES_UPDATED = "balances:updated";
// Posições/P&L mudaram de estado (carregando, carregadas ou com erro) — dados em `state`
export const POSITIONS_UPDATED = "positions:updated";
// Aba ativa mudou (detail = nome da aba, ex.: "price-chart")
export const TAB_CHANGED = "tab:changed";

export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, handler) {
  window.addEventListener(name, (e) => handler(e.detail));
}

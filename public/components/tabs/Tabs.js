import { emit, TAB_CHANGED } from "../../core/events.js";

// a aba ativa fica na URL como página: /site/<data-slug do botão> (ex.: /site/grafico-de-preco)
const BASE_PATH = "/site/";

let activeTab = null;

const tabButtons = () => [...document.querySelectorAll(".tab")];

function slugOf(tabName) {
  return tabButtons().find((b) => b.dataset.tab === tabName)?.dataset.slug || tabName;
}

// aba indicada pela URL atual (ou null se a URL não for de uma aba)
function tabFromUrl() {
  const slug = location.pathname.startsWith(BASE_PATH) ? location.pathname.slice(BASE_PATH.length).replace(/\/$/, "") : "";
  return tabButtons().find((b) => b.dataset.slug === slug)?.dataset.tab || null;
}

function syncUrl(tabName, replace) {
  const url = `${BASE_PATH}${slugOf(tabName)}${location.search}${location.hash}`;
  if (location.pathname + location.search + location.hash === url) return;
  history[replace ? "replaceState" : "pushState"]({ tab: tabName }, "", url);
}

/**
 * Ativa a aba `tabName` (botão + painel), atualiza a URL e avisa com TAB_CHANGED.
 * opts.history: "push" (padrão, vira uma entrada no Voltar), "replace" ou "none"
 */
export function showTab(tabName, { history: mode = "push" } = {}) {
  tabButtons().forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tabName);
  });
  if (mode !== "none") syncUrl(tabName, mode === "replace");
  if (tabName === activeTab) return;
  activeTab = tabName;
  emit(TAB_CHANGED, tabName);
}

export function isTabActive(tabName) {
  return activeTab === tabName;
}

export function initTabs() {
  const buttons = tabButtons();
  if (!buttons.length) return;

  // F5 ou link direto: abre a aba da URL; sem aba na URL, a marcada como ativa no HTML
  const initial = tabFromUrl() || (document.querySelector(".tab.active") || buttons[0]).dataset.tab;
  showTab(initial, { history: "replace" });

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // Voltar/Avançar do navegador
  window.addEventListener("popstate", () => {
    const tab = tabFromUrl();
    if (tab) showTab(tab, { history: "none" });
  });
}

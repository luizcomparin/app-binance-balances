import { emit, TAB_CHANGED } from "../../core/events.js";

let activeTab = null;

// Ativa a aba `tabName` (botão + painel) e avisa com TAB_CHANGED
export function showTab(tabName) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tabName);
  });
  if (tabName === activeTab) return;
  activeTab = tabName;
  emit(TAB_CHANGED, tabName);
}

export function isTabActive(tabName) {
  return activeTab === tabName;
}

export function initTabs() {
  const tabButtons = document.querySelectorAll(".tab");
  if (!tabButtons.length) return;

  const activeBtn = document.querySelector(".tab.active") || tabButtons[0];
  showTab(activeBtn.dataset.tab);

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

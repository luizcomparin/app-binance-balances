export function initTabs() {
  const tabButtons = document.querySelectorAll(".tab");
  const tabPanels = document.querySelectorAll(".tab-panel");

  function setActiveTab(tabName) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("active", isActive);
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.tab === tabName;
      panel.classList.toggle("active", isActive);
    });
  }

  if (tabButtons.length) {
    const activeBtn = document.querySelector(".tab.active") || tabButtons[0];
    setActiveTab(activeBtn.dataset.tab);

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
  }
}

import "./core/format.js";
import { showLoading, hideLoading } from "./core/dom.js";
import { initAppShell } from "./components/app/AppShell.js";
import { initTabs } from "./components/tabs/Tabs.js";
import { loadBalances, sortBalances } from "./components/balances/BalancesPanel.js";
import { loadOrders, applyOrderFilters, sortOrders } from "./components/orders/OrdersPanel.js";
import { openSimulationDialog, closeSimulationDialog } from "./components/simulation/SimulationModal.js";

async function boot() {
  showLoading();
  await initAppShell();

  initTabs();

  window.loadOrders = loadOrders;
  window.applyOrderFilters = applyOrderFilters;
  window.sortOrders = sortOrders;
  window.loadBalances = loadBalances;
  window.sortBalances = sortBalances;
  window.openSimulationDialog = openSimulationDialog;
  window.closeSimulationDialog = closeSimulationDialog;

  Promise.all([loadBalances(), loadOrders()]).finally(() => hideLoading());
}

boot();

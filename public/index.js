import "./core/format.js";
import { showLoading, hideLoading } from "./core/dom.js";
import { initAppShell } from "./components/app/AppShell.js";
import { initTabs } from "./components/tabs/Tabs.js";
import { loadBalances, sortBalances } from "./components/balances/BalancesPanel.js";
import { loadOrders, applyOrderFilters, sortOrders } from "./components/orders/OrdersPanel.js";
import { openSimulationDialog, closeSimulationDialog } from "./components/simulation/SimulationModal.js";
import {
  initExecutedOrdersPanel,
  loadExecutedOrders,
  applyExecutedFilters,
  sortExecutedOrders,
} from "./components/executed/ExecutedOrdersPanel.js";
import {
  initPriceChartModal,
  openPriceChart,
  closePriceChart,
  closePriceChartOnBackdrop,
} from "./components/price-chart/PriceChartModal.js";

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
  window.loadExecutedOrders = loadExecutedOrders;
  window.applyExecutedFilters = applyExecutedFilters;
  window.sortExecutedOrders = sortExecutedOrders;
  window.openPriceChart = openPriceChart;
  window.closePriceChart = closePriceChart;
  window.closePriceChartOnBackdrop = closePriceChartOnBackdrop;

  initExecutedOrdersPanel();
  initPriceChartModal();

  Promise.all([loadBalances(), loadOrders()]).finally(() => hideLoading());
}

boot();

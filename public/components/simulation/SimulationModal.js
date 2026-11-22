import { state } from "../../core/state.js";

// liga a busca uma vez só (antes era ligada a cada abertura do modal e os listeners se acumulavam)
export function initSimulationModal() {
  document.getElementById("simulation-search")?.addEventListener("input", filterAssets);
}

export function openSimulationDialog() {
  if (!state.currentAssets.length) {
    alert("Carregue a carteira primeiro.");
    return;
  }

  const inputsDiv = document.getElementById("simulation-inputs");
  if (!inputsDiv) return;

  inputsDiv.innerHTML = "";

  state.currentAssets.forEach((asset) => {
    const div = document.createElement("div");
    div.setAttribute("data-asset", asset.asset);
    div.innerHTML = `
      <label>${asset.asset} (${asset.totalUSDT
      .toFixed(2)
      .formatCurrency()} USDT):</label>
      <input type="number" id="sim-${asset.asset}" placeholder="0" step="0.01">
    `;
    inputsDiv.appendChild(div);
  });

  const inputs = inputsDiv.querySelectorAll("input[type='number']");
  inputs.forEach((input) => input.addEventListener("input", calculateSimulation));

  // a lista é recriada a cada abertura: limpa a busca da vez anterior para não ficar um filtro sem efeito
  const searchInput = document.getElementById("simulation-search");
  if (searchInput) searchInput.value = "";

  const modal = document.getElementById("simulation-modal");
  if (modal) {
    modal.style.display = "flex";
  }

  calculateSimulation();
}

export function closeSimulationDialog() {
  const modal = document.getElementById("simulation-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function calculateSimulation() {
  let newTotal = 0;

  state.currentAssets.forEach((asset) => {
    const input = document.getElementById(`sim-${asset.asset}`);
    const percent = parseFloat(input?.value) || 0;
    const changeFactor = 1 + percent / 100;
    const newValue = asset.totalUSDT * changeFactor;
    newTotal += newValue;
  });

  const result = document.getElementById("simulation-result");
  if (result) {
    result.innerText = `Valor estimado da carteira: \n ${newTotal
      .toFixed(2)
      .formatCurrency()} USDT`;
  }
}

function filterAssets() {
  const searchTerm = document
    .getElementById("simulation-search")
    .value.toLowerCase();
  const assetDivs = document.querySelectorAll("#simulation-inputs div");

  assetDivs.forEach((div) => {
    const asset = div.getAttribute("data-asset").toLowerCase();
    if (asset.includes(searchTerm)) {
      div.style.display = "flex";
    } else {
      div.style.display = "none";
    }
  });
}

// Format helpers (side effects: extends Number/String)
String.prototype.formatCurrency = function () {
  const numValue = parseFloat(this);

  if (isNaN(numValue) || numValue === null || numValue === undefined) {
    return "0,00";
  }

  return numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

Number.prototype.formatCurrency = function () {
  if (isNaN(this) || this === null || this === undefined) {
    return "0,00";
  }

  return this.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Preço com casas adaptativas: >= 1 usa 2 a 4 casas; < 1 usa 4 dígitos significativos
export function formatPrice(value) {
  if (value === null || value === undefined || isNaN(value)) return "--";
  const n = Number(value);
  if (Math.abs(n) >= 1) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return n.toLocaleString("pt-BR", { maximumSignificantDigits: 4 });
}

// Quantidade sem zeros sobrando à direita
export function formatQty(value) {
  if (value === null || value === undefined || isNaN(value)) return "--";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 8 });
}

// Classe CSS para valores positivos/negativos
export function signClass(value) {
  if (value === null || value === undefined || Math.abs(value) < 0.005) return "";
  return value > 0 ? "pnl-pos" : "pnl-neg";
}

// Número com sinal explícito (+/-) no formato pt-BR
export function formatSigned(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return "--";
  if (Math.abs(value) < 0.5 * 10 ** -decimals) return (0).formatCurrency();
  const sign = value > 0 ? "+" : "";
  return sign + Number(value.toFixed(decimals)).formatCurrency();
}

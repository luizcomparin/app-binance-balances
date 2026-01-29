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

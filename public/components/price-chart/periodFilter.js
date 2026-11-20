// Filtro de período das abas de histórico abaixo do gráfico (como na Binance):
// 1 dia · 1 semana · 1 mês · 3 meses · Tudo, ou datas escolhidas + Buscar / Limpar.

const DAY = 24 * 60 * 60 * 1000;
const PRESET_DAYS = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, all: Infinity };

// "2026-11-19" no fuso local
function dateInputValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// depois de trocar o período: rola até o fim da página para a lista ficar à vista
function scrollToEnd() {
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
}

/**
 * Liga o filtro aos elementos. els = { presets (botões com data-period), from, to, search, reset }
 * opts = { defaultPreset, oldest(): ms | null (data mostrada em "Tudo"), onChange() }
 */
export function createPeriodFilter(els, { defaultPreset = "90d", oldest = () => null, onChange = () => {} } = {}) {
  const st = { preset: defaultPreset, from: 0, to: 0 };

  function sync() {
    els.presets.forEach((b) => b.classList.toggle("active", b.dataset.period === st.preset));
    // "Tudo": a data inicial mostrada é a do item mais antigo (vazia enquanto carrega)
    const first = st.from ? st.from : oldest();
    els.from.value = first ? dateInputValue(first) : "";
    els.to.value = dateInputValue(st.to);
  }

  function apply(preset) {
    st.preset = preset;
    st.to = Date.now();
    st.from = preset === "all" ? 0 : st.to - PRESET_DAYS[preset] * DAY;
    sync();
  }

  const changed = () => {
    onChange();
    scrollToEnd();
  };

  els.presets.forEach((b) =>
    b.addEventListener("click", () => {
      apply(b.dataset.period);
      changed();
    })
  );
  els.search.addEventListener("click", () => {
    const from = els.from.value ? new Date(`${els.from.value}T00:00:00`).getTime() : NaN;
    const to = els.to.value ? new Date(`${els.to.value}T23:59:59.999`).getTime() : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return;
    st.preset = null;
    st.from = from;
    st.to = to;
    sync();
    changed();
  });
  els.reset.addEventListener("click", () => {
    apply(defaultPreset);
    changed();
  });

  apply(defaultPreset);

  return {
    /** o instante t está dentro do período escolhido? */
    contains: (t) => t >= st.from && t <= st.to,
    /** períodos prontos: o "agora" avança enquanto a página fica aberta */
    refresh() {
      if (st.preset) apply(st.preset);
    },
    /** dados chegaram: atualiza a data inicial mostrada em "Tudo" */
    dataChanged() {
      if (st.preset === "all") sync();
    },
  };
}

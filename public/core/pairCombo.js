// Filtro de par com busca (usado em Ordens Abertas e Ordens Executadas): ao focar ou digitar abre
// a lista com os pares encontrados; ↑ ↓ navegam, Enter escolhe, Esc fecha. Campo vazio = todos.

const ALL_PAIRS = "Todos os pares";

/**
 * input/list: campo de busca e <ul> da lista
 * getPairs(): pares disponíveis; isLoaded(): dados já chegaram (senão mostra "Carregando...")
 * onChange(pair): par escolhido mudou ("" = todos)
 * Devolve { value(), sync() } — sync(): descarta o par escolhido se ele não existe mais
 */
export function createPairCombo({ input, list, getPairs, isLoaded = () => true, onChange }) {
  let selected = "";
  let options = []; // [{ value, label }] na ordem exibida
  let active = 0;

  function render() {
    const term = input.value.trim().toUpperCase();
    const pairs = [...new Set(getPairs())].sort();
    const found = pairs.filter((p) => p.includes(term));
    options = [...(term ? [] : [{ value: "", label: ALL_PAIRS }]), ...found.map((p) => ({ value: p, label: p }))];
    active = Math.min(active, Math.max(0, options.length - 1));
    list.innerHTML = options.length
      ? options
          .map(
            (o, i) =>
              `<li role="option" data-idx="${i}" class="${i === active ? "active" : ""}${o.value === selected ? " current" : ""}"` +
              ` aria-selected="${o.value === selected}">${o.label}</li>`
          )
          .join("")
      : `<li class="empty">${isLoaded() ? "Nenhum par encontrado" : "Carregando ordens..."}</li>`;
  }

  function open() {
    render();
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  // fecha e mostra no campo o par escolhido (descarta o texto digitado sem escolher)
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.value = selected;
  }

  function select(value) {
    if (value === selected) return;
    selected = value;
    onChange(selected);
  }

  function choose(idx) {
    const o = options[idx];
    if (!o) return;
    select(o.value);
    close();
  }

  function highlight(idx) {
    active = Math.max(0, Math.min(options.length - 1, idx));
    list.querySelectorAll("li[data-idx]").forEach((li, i) => li.classList.toggle("active", i === active));
    list.querySelector("li.active")?.scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus", () => {
    input.select();
    active = 0;
    open();
  });
  input.addEventListener("input", () => {
    active = 0;
    open();
    // apagou tudo (inclusive pelo "x" do campo): volta a mostrar todos os pares
    if (!input.value) select("");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      if (list.hidden) open();
      else highlight(active + 1);
    } else if (e.key === "ArrowUp") highlight(active - 1);
    else if (e.key === "Enter") choose(active);
    else if (e.key === "Escape") {
      close();
      input.blur();
    } else return;
    e.preventDefault();
  });
  // mousedown (e não click): escolhe antes de o campo perder o foco
  list.addEventListener("mousedown", (e) => {
    const idx = Number(e.target.closest("li[data-idx]")?.dataset.idx);
    if (!Number.isInteger(idx)) return;
    e.preventDefault();
    choose(idx);
  });
  list.addEventListener("mousemove", (e) => {
    const idx = Number(e.target.closest("li[data-idx]")?.dataset.idx);
    if (Number.isInteger(idx) && idx !== active) highlight(idx);
  });
  input.addEventListener("blur", close);

  return {
    value: () => selected,
    sync() {
      if (selected && !getPairs().includes(selected)) {
        selected = "";
        if (document.activeElement !== input) input.value = "";
      }
    },
  };
}

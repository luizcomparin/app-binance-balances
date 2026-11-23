// Barra de ferramentas de desenho (sobre o gráfico). Arrastável pela alça; a posição fica salva.
import { TOOLS } from "./drawings.js";

const POSITION_KEY = "price-chart-draw-toolbar";

const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="2.5"/>`;
const ICONS = {
  trend: `<path d="M9.8 18.2 18.2 9.8"/>${dot(8, 20)}${dot(20, 8)}`,
  ray: `<path d="M8.8 19.2 13.2 14.8M16.8 11.2 24 4"/>${dot(7, 21)}${dot(15, 13)}`,
  hline: `<path d="M4 14h7.5M16.5 14H24"/>${dot(14, 14)}`,
  rect: `<path d="M9.5 7h9M21 9.5v9M18.5 21h-9M7 18.5v-9"/>${dot(7, 7)}${dot(21, 7)}${dot(21, 21)}${dot(7, 21)}`,
  channel: `<path d="M4 16 9.2 10.8M12.8 7.2 16 4M12 24l3.2-3.2M18.8 17.2 24 12"/>${dot(11, 9)}${dot(17, 19)}`,
  measure: `<path d="M4.5 18.5 18.5 4.5l5 5-14 14zM9 14l2 2M12 11l3 3M15 8l2 2"/>`,
};

const EYE_SVG = (on) =>
  `<svg class="lwc-draw-eye-icon" viewBox="0 0 24 24" width="20" height="20">${
    on
      ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/>'
  }</svg>`;

/**
 * onSelect(tool): botão clicado (o mesmo de novo = desligar). onToggleVisible(): olho clicado.
 * Devolve { setActive(tool|null), setVisible(visible) }
 */
export function createDrawingToolbar(wrap, onSelect, onToggleVisible) {
  const bar = document.createElement("div");
  bar.className = "lwc-draw-toolbar";
  bar.innerHTML =
    `<span class="lwc-draw-grip" title="Arraste para mover · Del apaga o desenho selecionado · Esc cancela"></span>` +
    `<button type="button" class="lwc-draw-eye" aria-pressed="false"></button>` +
    Object.entries(TOOLS)
      .map(
        ([key, t]) =>
          `<button type="button" data-tool="${key}" title="${t.label}" aria-label="${t.label}" aria-pressed="false">` +
          `<svg viewBox="0 0 28 28" width="24" height="24">${ICONS[key]}</svg></button>`
      )
      .join("");
  wrap.append(bar);

  let active = null;
  bar.addEventListener("click", (e) => {
    if (e.target.closest(".lwc-draw-eye")) return onToggleVisible?.();
    const btn = e.target.closest("button[data-tool]");
    if (btn) onSelect(btn.dataset.tool === active ? null : btn.dataset.tool);
  });

  // posição salva (relativa à área do gráfico), ajustada para não sair dela
  function place(left, top) {
    const maxLeft = Math.max(0, wrap.clientWidth - bar.offsetWidth);
    const maxTop = Math.max(0, wrap.clientHeight - bar.offsetHeight);
    bar.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    bar.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
  }
  try {
    const pos = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    if (Number.isFinite(pos?.left) && Number.isFinite(pos?.top)) requestAnimationFrame(() => place(pos.left, pos.top));
  } catch {
    // sem posição salva: fica no lugar padrão (CSS)
  }

  const grip = bar.querySelector(".lwc-draw-grip");
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startX = e.clientX - bar.offsetLeft;
    const startY = e.clientY - bar.offsetTop;
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => place(ev.clientX - startX, ev.clientY - startY);
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: bar.offsetLeft, top: bar.offsetTop }));
      } catch {
        // sem armazenamento: a posição vale só até recarregar
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });

  const eye = bar.querySelector(".lwc-draw-eye");

  return {
    setVisible(visible) {
      eye.innerHTML = EYE_SVG(visible);
      eye.title = visible ? "Ocultar todos os desenhos" : "Exibir os desenhos";
      eye.setAttribute("aria-label", eye.title);
      eye.setAttribute("aria-pressed", String(!visible));
      eye.classList.toggle("is-off", !visible);
    },
    setActive(tool) {
      active = tool;
      for (const btn of bar.querySelectorAll("button[data-tool]")) {
        const on = btn.dataset.tool === tool;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", String(on));
      }
    },
  };
}

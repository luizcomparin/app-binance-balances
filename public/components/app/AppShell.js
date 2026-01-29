async function loadComponents(root = document) {
  let slots = Array.from(root.querySelectorAll('[data-component]'));

  while (slots.length) {
    await Promise.all(
      slots.map(async (slot) => {
        const path = slot.getAttribute('data-component');
        const html = await fetch(path).then((r) => r.text());
        slot.outerHTML = html;
      })
    );

    slots = Array.from(root.querySelectorAll('[data-component]'));
  }
}

export async function initAppShell() {
  await loadComponents();
}

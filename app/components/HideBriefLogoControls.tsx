"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { db } from "@/lib/firebase";

type ClientTextBlock = {
  id: string;
  text: string;
  role: string;
  roleLabel?: string;
  priority: string;
  priorityLabel?: string;
  instruction: string;
  locked: boolean;
};

const textFilters = [
  ["all", "Todos"],
  ["headline", "Titulares"],
  ["subheadline", "Secundarios"],
  ["claim", "Claims"],
  ["badge", "Badges"],
  ["bullet", "Bullets"],
  ["promo", "Precio / promo"],
  ["cta", "CTA"],
  ["date", "Fecha"],
  ["location", "Ubicación"],
  ["disclaimer", "Disclaimer"],
  ["free", "Libres"],
] as const;

const assetFilters = [
  ["all", "Todos"],
  ["logo", "Logos"],
  ["reference", "Referencias"],
  ["product", "Producto"],
  ["element", "Elementos"],
  ["stock", "Stock"],
  ["featured", "Destacados"],
] as const;

const cache = new Map<string, ClientTextBlock[]>();
const watchedSelects = new WeakSet<HTMLSelectElement>();
let currentLibraryClientId = "";
let clearForClientId = "";

function n(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isBriefPage() {
  const path = window.location.pathname;
  return path === "/dashboard/generador" || path.startsWith("/dashboard/generador/editar/");
}

function sectionsContaining(text: string) {
  const needle = n(text);
  return Array.from(document.querySelectorAll("section")).filter((section): section is HTMLElement => n(section.textContent || "").includes(needle));
}

function activeBlocksSection() {
  return sectionsContaining("3. mensaje y bloques de texto").find((section) => section.querySelector("textarea")) || null;
}

function sidebarAssetSection() {
  return sectionsContaining("assets del cliente").find((section) => section.closest("aside")) || null;
}

function clientSelect() {
  const byId = document.getElementById("client-select");
  if (byId instanceof HTMLSelectElement) return byId;
  return Array.from(document.querySelectorAll("form select")).find((select) =>
    Array.from(select.options).some((option) => n(option.textContent || "").includes("selecciona un cliente")),
  ) || null;
}

function buttonClass(active: boolean) {
  return active
    ? "rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition"
    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50";
}

function normalizeBlocks(value: unknown): ClientTextBlock[] {
  if (!Array.isArray(value)) return [];
  const result: ClientTextBlock[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const source = item as Partial<ClientTextBlock>;
    const text = typeof source.text === "string" ? source.text.trim() : "";
    if (!text) return;

    result.push({
      id: typeof source.id === "string" && source.id ? source.id : `block-${Math.random().toString(36).slice(2, 8)}`,
      text,
      role: typeof source.role === "string" ? source.role : "free",
      roleLabel: typeof source.roleLabel === "string" ? source.roleLabel : "Texto libre",
      priority: typeof source.priority === "string" ? source.priority : "medium",
      priorityLabel: typeof source.priorityLabel === "string" ? source.priorityLabel : "Media",
      instruction: typeof source.instruction === "string" ? source.instruction : "",
      locked: source.locked !== false,
    });
  });

  return result;
}

async function loadBlocks(clientId: string) {
  if (cache.has(clientId)) return cache.get(clientId) || [];
  const snap = await getDoc(doc(db, "clients", clientId));
  const blocks = snap.exists() ? normalizeBlocks(snap.data().textBlocks) : [];
  cache.set(clientId, blocks);
  return blocks;
}

function setField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function blockCards() {
  const section = activeBlocksSection();
  if (!section) return [];
  return Array.from(section.querySelectorAll("div.rounded-2xl, div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    if (card.closest("[data-client-block-library]")) return false;
    const text = n(card.textContent || "");
    return text.includes("bloque") && !text.includes("que debe entender");
  });
}

function fillBlock(card: HTMLElement, block: ClientTextBlock) {
  const textarea = card.querySelector("textarea");
  if (textarea instanceof HTMLTextAreaElement) setField(textarea, block.text);
  const selects = Array.from(card.querySelectorAll("select"));
  if (selects[0]) setField(selects[0], block.role);
  if (selects[1]) setField(selects[1], block.priority);
  const note = Array.from(card.querySelectorAll("input")).find((input) => input.type !== "checkbox");
  if (note instanceof HTMLInputElement) setField(note, block.instruction);
  const locked = Array.from(card.querySelectorAll("input")).find((input) => input.type === "checkbox");
  if (locked instanceof HTMLInputElement && locked.checked !== block.locked) locked.click();
}

function useBlock(block: ClientTextBlock) {
  const empty = blockCards().find((card) => {
    const area = card.querySelector("textarea");
    return area instanceof HTMLTextAreaElement && area.value.trim() === "";
  });
  if (empty) {
    fillBlock(empty, block);
    return;
  }
  const add = Array.from(document.querySelectorAll("button")).find((button) => n(button.textContent || "").includes("agregar bloque"));
  if (add instanceof HTMLButtonElement) add.click();
  window.setTimeout(() => {
    const cards = blockCards();
    const last = cards[cards.length - 1];
    if (last) fillBlock(last, block);
  }, 80);
}

function clearBlocks() {
  blockCards().forEach((card) => {
    const remove = Array.from(card.querySelectorAll("button")).find((button) => n(button.textContent || "").includes("quitar"));
    if (remove instanceof HTMLButtonElement) remove.click();
  });
  window.setTimeout(() => {
    blockCards().forEach((card) => {
      const area = card.querySelector("textarea");
      if (area instanceof HTMLTextAreaElement) setField(area, "");
    });
  }, 120);
}

function makePills(filters: readonly (readonly [string, string])[], onClick: (id: string) => void) {
  const wrap = document.createElement("div");
  wrap.className = "my-4 flex flex-wrap gap-2";
  filters.forEach(([id, label], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = buttonClass(index === 0);
    button.textContent = label;
    button.addEventListener("click", () => {
      Array.from(wrap.querySelectorAll("button")).forEach((item) => {
        if (item instanceof HTMLButtonElement) item.className = buttonClass(item === button);
      });
      onClick(id);
    });
    wrap.appendChild(button);
  });
  return wrap;
}

function showLibrary(clientId: string, blocks: ClientTextBlock[]) {
  const assetSection = sidebarAssetSection();
  const aside = assetSection?.parentElement;
  if (!assetSection || !aside) return;

  document.querySelectorAll("[data-client-block-library]").forEach((el) => el.remove());
  currentLibraryClientId = clientId;

  const section = document.createElement("section");
  section.dataset.clientBlockLibrary = "true";
  section.className = "rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8";

  const title = document.createElement("p");
  title.className = "text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500";
  title.textContent = "Bloques del cliente";
  const heading = document.createElement("h2");
  heading.className = "mt-2 text-2xl font-semibold tracking-tight";
  heading.textContent = "Elegir textos";
  const desc = document.createElement("p");
  desc.className = "mt-2 text-sm leading-6 text-zinc-600";
  desc.textContent = "Elige cuáles bloques guardados quieres usar en este brief. No se agregan automáticamente.";
  section.append(title, heading, desc);

  const list = document.createElement("div");
  list.className = "mt-4 grid gap-3";

  const applyFilter = (filter: string) => {
    let visible = 0;
    list.querySelectorAll("[data-block-role]").forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const role = card.dataset.blockRole || "";
      const match = filter === "all" || role === filter || (filter === "promo" && (role === "price" || role === "promotion"));
      card.style.display = match ? "" : "none";
      if (match) visible += 1;
    });
    const empty = list.querySelector("[data-empty]");
    if (empty instanceof HTMLElement) empty.style.display = visible ? "none" : "";
  };

  section.appendChild(makePills(textFilters, applyFilter));

  const empty = document.createElement("p");
  empty.dataset.empty = "true";
  empty.className = "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600";
  empty.textContent = blocks.length ? "No hay bloques guardados para este filtro." : "Este cliente todavía no tiene bloques guardados.";
  list.appendChild(empty);

  blocks.forEach((block) => {
    const card = document.createElement("div");
    card.dataset.blockRole = block.role;
    card.className = "rounded-2xl border border-zinc-200 bg-zinc-50 p-3";
    const meta = document.createElement("p");
    meta.className = "text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
    meta.textContent = `${block.roleLabel || block.role} · ${block.priorityLabel || block.priority}${block.locked ? " · Exacto" : ""}`;
    const text = document.createElement("p");
    text.className = "mt-2 text-sm font-semibold leading-6 text-zinc-950";
    text.textContent = block.text;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mt-3 inline-flex h-9 items-center justify-center rounded-2xl bg-zinc-950 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800";
    button.textContent = "+ Usar en este brief";
    button.addEventListener("click", () => useBlock(block));
    card.append(meta, text, button);
    list.appendChild(card);
  });

  empty.style.display = blocks.length ? "none" : "";
  section.appendChild(list);
  aside.insertBefore(section, assetSection);
}

async function syncLibrary(clientId: string, shouldClear: boolean) {
  if (!clientId) return;
  const blocks = await loadBlocks(clientId);
  showLibrary(clientId, blocks);
  if (shouldClear) {
    window.setTimeout(() => {
      clearBlocks();
      clearForClientId = "";
    }, 160);
  }
}

function watchClientSelect() {
  const select = clientSelect();
  if (!select) return;
  if (select.value && currentLibraryClientId !== select.value) void syncLibrary(select.value, false);
  if (watchedSelects.has(select)) return;
  watchedSelects.add(select);
  select.addEventListener("change", () => {
    clearForClientId = select.value;
    void syncLibrary(select.value, true);
    window.setTimeout(() => {
      if (clearForClientId === select.value) clearBlocks();
    }, 500);
  });
}

function removeMainPills() {
  document.querySelectorAll('[data-bust-filter-pills="text-blocks"], [data-bust-filter-pills="client-library"]').forEach((el) => {
    if (!el.closest("aside")) el.remove();
  });
  sectionsContaining("1. selecciona la marca").concat(sectionsContaining("3. mensaje y bloques de texto")).forEach((section) => {
    Array.from(section.children).forEach((child) => {
      if (!(child instanceof HTMLElement) || child.closest("aside")) return;
      const text = n(child.textContent || "");
      const count = textFilters.filter(([, label]) => text.includes(n(label))).length;
      if (count >= 4) child.remove();
    });
  });
}

function filterAssetCards(section: HTMLElement, filter: string) {
  section.querySelectorAll("button.rounded-3xl, div.rounded-3xl").forEach((card) => {
    if (!(card instanceof HTMLElement) || card.dataset.assetPills) return;
    const text = n(card.textContent || "");
    const match = filter === "all" || text.includes(filter) || (filter === "featured" && text.includes("destacado")) || (filter === "reference" && text.includes("referencia"));
    card.style.display = match ? "" : "none";
  });
}

function addAssetPills() {
  const section = sidebarAssetSection();
  if (!section || section.dataset.assetPillsReady === "true") return;
  section.dataset.assetPillsReady = "true";
  const pills = makePills(assetFilters, (filter) => filterAssetCards(section, filter));
  pills.dataset.assetPills = "true";
  const target = Array.from(section.children).find((child) => child instanceof HTMLElement && (child.className.toString().includes("mt-5") || child.className.toString().includes("grid gap")));
  section.insertBefore(pills, target || section.children[2] || null);
}

function hideConfusingControls() {
  document.querySelectorAll("p, label, button, span, h2").forEach((el) => {
    const text = n(el.textContent || "");
    if (text.includes("5. logo oficial opcional") || text.includes("motor de ia") || text.includes("seleccion del generador")) {
      const section = el.closest("section");
      if (section instanceof HTMLElement) section.style.display = "none";
    }
    if (text === "logo visible") {
      const button = el.closest("button");
      if (button instanceof HTMLElement) button.style.display = "none";
    }
    if (text === "motor sugerido") {
      const card = el.closest("div");
      if (card instanceof HTMLElement) card.style.display = "none";
    }
  });
}

function run() {
  if (!isBriefPage()) return;
  hideConfusingControls();
  removeMainPills();
  watchClientSelect();
  addAssetPills();
}

export default function HideBriefLogoControls() {
  useEffect(() => {
    run();
    const observer = new MutationObserver(() => {
      run();
      window.setTimeout(removeMainPills, 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

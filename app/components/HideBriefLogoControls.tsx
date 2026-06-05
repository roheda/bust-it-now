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

const textBlockFilters = [
  { id: "all", label: "Todos" },
  { id: "headline", label: "Titulares" },
  { id: "subheadline", label: "Secundarios" },
  { id: "claim", label: "Claims" },
  { id: "badge", label: "Badges" },
  { id: "bullet", label: "Bullets" },
  { id: "promo", label: "Precio / promo" },
  { id: "cta", label: "CTA" },
  { id: "date", label: "Fecha" },
  { id: "location", label: "Ubicación" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "free", label: "Libres" },
];

const assetFilters = [
  { id: "all", label: "Todos" },
  { id: "logo", label: "Logos" },
  { id: "reference", label: "Referencias" },
  { id: "product", label: "Producto" },
  { id: "element", label: "Elementos" },
  { id: "stock", label: "Stock" },
  { id: "featured", label: "Destacados" },
];

const clientBlockCache = new Map<string, ClientTextBlock[]>();
const observedClientSelects = new WeakSet<HTMLSelectElement>();
let pendingClearClientId = "";
let renderedLibraryClientId = "";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isGeneratorBriefPage() {
  if (typeof window === "undefined") return false;

  const pathname = window.location.pathname;
  return pathname === "/dashboard/generador" || pathname.startsWith("/dashboard/generador/editar/");
}

function pillClass(active: boolean) {
  return active
    ? "rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition"
    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50";
}

function setActivePill(wrapper: HTMLElement, activeFilter: string) {
  Array.from(wrapper.querySelectorAll("button[data-filter-id]")).forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.className = pillClass(button.dataset.filterId === activeFilter);
  });
}

function createFilterWrapper({
  kind,
  options,
  activeFilter,
  onFilter,
}: {
  kind: "assets" | "client-library";
  options: Array<{ id: string; label: string }>;
  activeFilter: string;
  onFilter: (filterId: string) => void;
}) {
  const wrapper = document.createElement("div");
  wrapper.dataset.bustFilterPills = kind;
  wrapper.className = "my-4 flex flex-wrap gap-2";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.filterId = option.id;
    button.className = pillClass(option.id === activeFilter);
    button.textContent = option.label;
    button.addEventListener("click", () => {
      onFilter(option.id);
      setActivePill(wrapper, option.id);
    });
    wrapper.appendChild(button);
  });

  return wrapper;
}

function findSectionsByText(patterns: string[]) {
  const normalizedPatterns = patterns.map(normalizeText);

  return Array.from(document.querySelectorAll("section")).filter((section): section is HTMLElement => {
    const text = normalizeText(section.textContent || "");
    return normalizedPatterns.some((pattern) => text.includes(pattern));
  });
}

function getActiveTextBlockSection() {
  return findSectionsByText(["3. mensaje y bloques de texto"]).find((section) => section.querySelector("textarea")) || null;
}

function getSidebarAssetSection() {
  return findSectionsByText(["assets del cliente"]).find((section) => section.closest("aside")) || null;
}

function insertFilterBeforeList(section: HTMLElement, wrapper: HTMLElement) {
  const candidates = Array.from(section.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.dataset.bustFilterPills) return false;
    if (child.dataset.bustClientBlockLibrary) return false;

    const className = child.className.toString();
    return (
      className.includes("space-y-4") ||
      className.includes("space-y-3") ||
      className.includes("grid gap") ||
      className.includes("mt-5")
    );
  });

  const target = candidates.find((child) => child.querySelector("button, div.rounded-2xl, div.rounded-3xl"));
  section.insertBefore(wrapper, target || section.children[2] || null);
}

function assetCardMatches(card: HTMLElement, filterId: string) {
  if (filterId === "all") return true;

  const text = normalizeText(card.textContent || "");

  switch (filterId) {
    case "logo":
      return text.includes("logo") || text.includes("logotipo");
    case "reference":
      return text.includes("reference") || text.includes("referencia");
    case "product":
      return text.includes("product") || text.includes("producto");
    case "element":
      return text.includes("element") || text.includes("elemento");
    case "stock":
      return text.includes("stock");
    case "featured":
      return text.includes("destacado");
    default:
      return true;
  }
}

function findTextBlockCards(section: HTMLElement) {
  const cards = Array.from(section.querySelectorAll("div.rounded-2xl, div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    if (card.dataset.bustFilterPills) return false;
    if (card.closest("[data-bust-client-block-library]")) return false;

    const text = normalizeText(card.textContent || "");
    const looksLikeTextBlock =
      text.includes("bloque") ||
      text.includes("titular") ||
      text.includes("secundaria") ||
      text.includes("claim") ||
      text.includes("sello") ||
      text.includes("badge") ||
      text.includes("bullet") ||
      text.includes("cta") ||
      text.includes("fecha") ||
      text.includes("ubicacion") ||
      text.includes("disclaimer") ||
      text.includes("texto libre") ||
      text.includes("exacto");

    return looksLikeTextBlock && !text.includes("que debe entender la persona en 3 segundos");
  });

  return cards.filter((card) => !card.closest("[data-bust-filter-pills]"));
}

function findAssetCards(section: HTMLElement) {
  return Array.from(section.querySelectorAll("button.rounded-3xl, div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    if (card.dataset.bustFilterPills) return false;

    const text = normalizeText(card.textContent || "");
    return (
      text.includes("usar") ||
      text.includes("omitir") ||
      text.includes("asset") ||
      text.includes("logo") ||
      text.includes("referencia") ||
      text.includes("producto") ||
      text.includes("elemento") ||
      text.includes("stock") ||
      text.includes("destacado")
    );
  });
}

function applyAssetFilter(section: HTMLElement, filterId: string) {
  section.dataset.activeAssetFilter = filterId;
  const cards = findAssetCards(section);
  let visibleCount = 0;

  cards.forEach((card) => {
    const visible = assetCardMatches(card, filterId);
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });

  ensureEmptyState(section, "assets", visibleCount, "No hay assets en esta categoría.");
}

function ensureEmptyState(section: HTMLElement, kind: string, visibleCount: number, message: string) {
  const existing = section.querySelector(`[data-bust-empty-state="${kind}"]`);

  if (visibleCount > 0) {
    existing?.remove();
    return;
  }

  if (existing) return;

  const empty = document.createElement("p");
  empty.dataset.bustEmptyState = kind;
  empty.className = "mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600";
  empty.textContent = message;
  const wrapper = section.querySelector(`[data-bust-filter-pills="${kind}"]`);
  wrapper?.insertAdjacentElement("afterend", empty);
}

function normalizeClientTextBlocks(value: unknown): ClientTextBlock[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const block = item as Partial<ClientTextBlock>;
      const text = typeof block.text === "string" ? block.text.trim() : "";
      if (!text) return null;

      return {
        id: typeof block.id === "string" && block.id ? block.id : `library-${Math.random().toString(36).slice(2, 8)}`,
        text,
        role: typeof block.role === "string" ? block.role : "free",
        roleLabel: typeof block.roleLabel === "string" ? block.roleLabel : "Texto libre",
        priority: typeof block.priority === "string" ? block.priority : "medium",
        priorityLabel: typeof block.priorityLabel === "string" ? block.priorityLabel : "Media",
        instruction: typeof block.instruction === "string" ? block.instruction : "",
        locked: block.locked !== false,
      } satisfies ClientTextBlock;
    })
    .filter((block): block is ClientTextBlock => Boolean(block));
}

async function loadClientTextBlocks(clientId: string) {
  if (clientBlockCache.has(clientId)) return clientBlockCache.get(clientId) || [];

  const snapshot = await getDoc(doc(db, "clients", clientId));
  const blocks = snapshot.exists() ? normalizeClientTextBlocks(snapshot.data().textBlocks) : [];
  clientBlockCache.set(clientId, blocks);
  return blocks;
}

function getClientSelect() {
  const direct = document.getElementById("client-select");
  if (direct instanceof HTMLSelectElement) return direct;

  const form = document.querySelector("form");
  if (!form) return null;

  const selects = Array.from(form.querySelectorAll("select"));
  return selects.find((select) =>
    Array.from(select.options).some((option) => normalizeText(option.textContent || "").includes("selecciona un cliente")),
  ) || selects[0] || null;
}

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckboxValue(element: HTMLInputElement, checked: boolean) {
  if (element.checked !== checked) {
    element.click();
  }
}

function fillTextBlockCard(card: HTMLElement, block: ClientTextBlock) {
  const textarea = card.querySelector("textarea");
  if (textarea instanceof HTMLTextAreaElement) setFieldValue(textarea, block.text);

  const selects = Array.from(card.querySelectorAll("select"));
  if (selects[0]) setFieldValue(selects[0], block.role || "free");
  if (selects[1]) setFieldValue(selects[1], block.priority || "medium");

  const instructionInput = Array.from(card.querySelectorAll("input")).find((input) => input.type !== "checkbox");
  if (instructionInput instanceof HTMLInputElement) setFieldValue(instructionInput, block.instruction || "");

  const lockedInput = Array.from(card.querySelectorAll("input")).find((input) => input.type === "checkbox");
  if (lockedInput instanceof HTMLInputElement) setCheckboxValue(lockedInput, block.locked !== false);
}

function textBlockCardIsEmpty(card: HTMLElement) {
  const textarea = card.querySelector("textarea");
  return textarea instanceof HTMLTextAreaElement && textarea.value.trim().length === 0;
}

function findAddTextBlockButton(section: HTMLElement) {
  return Array.from(section.querySelectorAll("button")).find((button): button is HTMLButtonElement => {
    return normalizeText(button.textContent || "").includes("agregar bloque");
  }) || null;
}

function addBlockToActiveBrief(block: ClientTextBlock) {
  const section = getActiveTextBlockSection();
  if (!section) return;

  const cards = findTextBlockCards(section);
  const emptyCard = cards.find(textBlockCardIsEmpty);

  if (emptyCard) {
    fillTextBlockCard(emptyCard, block);
    return;
  }

  const addButton = findAddTextBlockButton(section);
  addButton?.click();

  window.setTimeout(() => {
    const updatedCards = findTextBlockCards(section);
    const targetCard = updatedCards[updatedCards.length - 1];
    if (targetCard) fillTextBlockCard(targetCard, block);
  }, 80);
}

function clearActiveTextBlocks() {
  const section = getActiveTextBlockSection();
  if (!section) return;

  const cards = findTextBlockCards(section);
  cards.forEach((card) => {
    const removeButton = Array.from(card.querySelectorAll("button")).find((button): button is HTMLButtonElement => {
      return normalizeText(button.textContent || "").includes("quitar");
    });
    removeButton?.click();
  });

  window.setTimeout(() => {
    const remainingCards = findTextBlockCards(section);
    remainingCards.forEach((card) => {
      const textarea = card.querySelector("textarea");
      if (textarea instanceof HTMLTextAreaElement) setFieldValue(textarea, "");

      const selects = Array.from(card.querySelectorAll("select"));
      if (selects[0]) setFieldValue(selects[0], "headline");
      if (selects[1]) setFieldValue(selects[1], "high");

      const instructionInput = Array.from(card.querySelectorAll("input")).find((input) => input.type !== "checkbox");
      if (instructionInput instanceof HTMLInputElement) setFieldValue(instructionInput, "");

      const lockedInput = Array.from(card.querySelectorAll("input")).find((input) => input.type === "checkbox");
      if (lockedInput instanceof HTMLInputElement) setCheckboxValue(lockedInput, true);
    });
  }, 120);
}

function libraryCardMatches(card: HTMLElement, filterId: string) {
  if (filterId === "all") return true;
  const role = card.dataset.blockRole || "";
  if (filterId === "promo") return role === "price" || role === "promotion";
  return role === filterId;
}

function applyLibraryFilter(wrapper: HTMLElement, filterId: string) {
  const cards = Array.from(wrapper.querySelectorAll("[data-library-block-card]")).filter((card): card is HTMLElement => card instanceof HTMLElement);
  let visibleCount = 0;

  cards.forEach((card) => {
    const visible = libraryCardMatches(card, filterId);
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });

  const empty = wrapper.querySelector("[data-library-empty-state]");
  if (empty instanceof HTMLElement) empty.style.display = visibleCount > 0 ? "none" : "";
}

function removeMainAreaTextFilters() {
  document.querySelectorAll('[data-bust-filter-pills="text-blocks"], [data-bust-empty-state="text-blocks"]').forEach((element) => element.remove());

  const activeSection = getActiveTextBlockSection();
  if (!activeSection) return;
  findTextBlockCards(activeSection).forEach((card) => {
    card.style.display = "";
  });
}

function renderClientBlockLibrary(clientId: string, blocks: ClientTextBlock[]) {
  const assetSection = getSidebarAssetSection();
  const sidebar = assetSection?.parentElement;
  if (!assetSection || !sidebar) return;

  document.querySelectorAll("[data-bust-client-block-library]").forEach((element) => element.remove());
  renderedLibraryClientId = clientId;

  const wrapper = document.createElement("section");
  wrapper.dataset.bustClientBlockLibrary = "true";
  wrapper.className = "rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8";

  const title = document.createElement("p");
  title.className = "text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500";
  title.textContent = "Bloques del cliente";
  wrapper.appendChild(title);

  const heading = document.createElement("h2");
  heading.className = "mt-2 text-2xl font-semibold tracking-tight";
  heading.textContent = "Elegir textos";
  wrapper.appendChild(heading);

  const description = document.createElement("p");
  description.className = "mt-2 text-sm leading-6 text-zinc-600";
  description.textContent = "Elige cuáles bloques guardados quieres usar en este brief. No se agregan automáticamente.";
  wrapper.appendChild(description);

  const filterWrapper = createFilterWrapper({
    kind: "client-library",
    options: textBlockFilters,
    activeFilter: "all",
    onFilter: (filterId) => applyLibraryFilter(wrapper, filterId),
  });
  wrapper.appendChild(filterWrapper);

  const list = document.createElement("div");
  list.className = "mt-4 grid gap-3";
  wrapper.appendChild(list);

  const empty = document.createElement("p");
  empty.dataset.libraryEmptyState = "true";
  empty.className = "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600";
  empty.textContent = blocks.length > 0 ? "No hay bloques guardados para este filtro." : "Este cliente todavía no tiene bloques guardados.";
  list.appendChild(empty);

  blocks.forEach((block) => {
    const card = document.createElement("div");
    card.dataset.libraryBlockCard = "true";
    card.dataset.blockRole = block.role;
    card.className = "rounded-2xl border border-zinc-200 bg-zinc-50 p-3";

    const meta = document.createElement("div");
    meta.className = "mb-2 flex flex-wrap gap-2";
    meta.innerHTML = `<span class="rounded-full bg-zinc-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">${block.roleLabel || block.role}</span><span class="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700">${block.priorityLabel || block.priority}</span>${block.locked ? `<span class="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Exacto</span>` : ""}`;
    card.appendChild(meta);

    const text = document.createElement("p");
    text.className = "text-sm font-semibold leading-6 text-zinc-950";
    text.textContent = block.text;
    card.appendChild(text);

    if (block.instruction) {
      const instruction = document.createElement("p");
      instruction.className = "mt-1 text-xs leading-5 text-zinc-500";
      instruction.textContent = block.instruction;
      card.appendChild(instruction);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mt-3 inline-flex h-9 items-center justify-center rounded-2xl bg-zinc-950 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800";
    button.textContent = "+ Usar en este brief";
    button.addEventListener("click", () => addBlockToActiveBrief(block));
    card.appendChild(button);

    list.appendChild(card);
  });

  empty.style.display = blocks.length > 0 ? "none" : "";
  sidebar.insertBefore(wrapper, assetSection);
}

async function syncClientBlockLibrary(clientId: string, shouldClearActiveBlocks: boolean) {
  if (!clientId) return;

  try {
    const blocks = await loadClientTextBlocks(clientId);
    renderClientBlockLibrary(clientId, blocks);

    if (shouldClearActiveBlocks) {
      window.setTimeout(() => {
        clearActiveTextBlocks();
        pendingClearClientId = "";
      }, 160);
    }
  } catch (error) {
    console.error(error);
  }
}

function watchClientSelector() {
  const select = getClientSelect();
  if (!select) return;

  const currentClientId = select.value;
  if (currentClientId && renderedLibraryClientId !== currentClientId) {
    void syncClientBlockLibrary(currentClientId, false);
  }

  if (observedClientSelects.has(select)) return;
  observedClientSelects.add(select);

  select.addEventListener("change", () => {
    const clientId = select.value;
    pendingClearClientId = clientId;
    if (!clientId) return;

    void syncClientBlockLibrary(clientId, true);
    window.setTimeout(() => {
      if (pendingClearClientId === clientId) clearActiveTextBlocks();
    }, 500);
  });
}

function addAssetFilters() {
  const sections = findSectionsByText(["assets del cliente"]);

  sections.forEach((section) => {
    if (section.dataset.bustAssetFilterReady === "true") {
      applyAssetFilter(section, section.dataset.activeAssetFilter || "all");
      return;
    }

    section.dataset.bustAssetFilterReady = "true";
    section.dataset.activeAssetFilter = "all";
    const wrapper = createFilterWrapper({
      kind: "assets",
      options: assetFilters,
      activeFilter: "all",
      onFilter: (filterId) => applyAssetFilter(section, filterId),
    });
    insertFilterBeforeList(section, wrapper);
    applyAssetFilter(section, "all");
  });
}

function hideBriefControls() {
  if (!isGeneratorBriefPage()) return;

  const allElements = Array.from(document.querySelectorAll("p, label, button, span, h2"));

  allElements.forEach((element) => {
    const text = element.textContent?.trim().toLowerCase() || "";

    if (text.includes("5. logo oficial opcional")) {
      const section = element.closest("section");
      if (section instanceof HTMLElement) {
        section.style.display = "none";
        section.setAttribute("data-hidden-logo-brief-section", "true");
      }
    }

    if (text === "logo visible") {
      const button = element.closest("button");
      if (button instanceof HTMLElement) {
        button.style.display = "none";
        button.setAttribute("data-hidden-logo-visual-chip", "true");
      }
    }

    if (text.includes("motor de ia") || text.includes("selección del generador")) {
      const section = element.closest("section");
      if (section instanceof HTMLElement) {
        section.style.display = "none";
        section.setAttribute("data-hidden-generator-model-section", "true");
      }
    }

    if (text === "motor sugerido") {
      const card = element.closest("div");
      if (card instanceof HTMLElement) {
        card.style.display = "none";
        card.setAttribute("data-hidden-suggested-model-card", "true");
      }
    }
  });

  removeMainAreaTextFilters();
  watchClientSelector();
  addAssetFilters();
}

export default function HideBriefLogoControls() {
  useEffect(() => {
    hideBriefControls();

    const observer = new MutationObserver(() => {
      hideBriefControls();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

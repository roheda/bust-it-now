"use client";

import { useEffect } from "react";

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
  kind: "text-blocks" | "assets";
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

function insertFilterBeforeList(section: HTMLElement, wrapper: HTMLElement) {
  const candidates = Array.from(section.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.dataset.bustFilterPills) return false;

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

function textBlockCardMatches(card: HTMLElement, filterId: string) {
  if (filterId === "all") return true;

  const text = normalizeText(card.textContent || "");

  switch (filterId) {
    case "headline":
      return text.includes("titular") || text.includes("main headline");
    case "subheadline":
      return text.includes("secundaria") || text.includes("subheadline") || text.includes("secondary");
    case "claim":
      return text.includes("claim");
    case "badge":
      return text.includes("sello") || text.includes("badge");
    case "bullet":
      return text.includes("bullet");
    case "promo":
      return text.includes("precio") || text.includes("promo") || text.includes("promocion");
    case "cta":
      return text.includes("cta");
    case "date":
      return text.includes("fecha") || text.includes("date");
    case "location":
      return text.includes("ubicacion") || text.includes("location");
    case "disclaimer":
      return text.includes("disclaimer");
    case "free":
      return text.includes("libre") || text.includes("free");
    default:
      return true;
  }
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

function applyTextBlockFilter(section: HTMLElement, filterId: string) {
  section.dataset.activeTextBlockFilter = filterId;
  const cards = findTextBlockCards(section);
  let visibleCount = 0;

  cards.forEach((card) => {
    const visible = textBlockCardMatches(card, filterId);
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });

  ensureEmptyState(section, "text-blocks", visibleCount, "No hay bloques para este filtro.");
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

function addTextBlockFilters() {
  const sections = [
    ...findSectionsByText(["bloques del cliente", "3. mensaje y bloques de texto"]),
  ];

  sections.forEach((section) => {
    if (section.dataset.bustTextBlockFilterReady === "true") {
      applyTextBlockFilter(section, section.dataset.activeTextBlockFilter || "all");
      return;
    }

    section.dataset.bustTextBlockFilterReady = "true";
    section.dataset.activeTextBlockFilter = "all";
    const wrapper = createFilterWrapper({
      kind: "text-blocks",
      options: textBlockFilters,
      activeFilter: "all",
      onFilter: (filterId) => applyTextBlockFilter(section, filterId),
    });
    insertFilterBeforeList(section, wrapper);
    applyTextBlockFilter(section, "all");
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

  addTextBlockFilters();
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

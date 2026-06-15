"use client";

import { useEffect } from "react";

const filters = [
  ["all", "Todos"],
  ["reference", "Referencias"],
  ["product", "Producto"],
  ["element", "Elementos"],
  ["stock", "Stock"],
  ["featured", "Destacados"],
] as const;

const wiredButtons = new WeakSet<HTMLButtonElement>();

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isBriefPage() {
  const path = window.location.pathname;
  return path === "/dashboard/generador" || path.startsWith("/dashboard/generador/editar/");
}

function getAssetSection() {
  return Array.from(document.querySelectorAll("aside section")).find((section): section is HTMLElement => {
    return section instanceof HTMLElement && normalize(section.textContent || "").includes("assets del cliente");
  });
}

function isLogoCard(card: HTMLElement) {
  const text = normalize(card.textContent || "");
  return text.includes("logo") || text.includes("logotipo") || text.includes("imagotipo") || text.includes("isotipo");
}

function getAssetCards(section: HTMLElement) {
  return Array.from(section.querySelectorAll("[data-bust-asset-card='true'], button.rounded-3xl, div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    if (card.closest("[data-client-block-library]")) return false;
    if (card.closest("[data-bust-strict-asset-filters]")) return false;
    if (card.closest("[data-bust-asset-filter-row]")) return false;
    return Boolean(card.querySelector("img"));
  });
}

function buttonClass(active: boolean) {
  return active
    ? "rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition"
    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50";
}

function removeCompetingFilterRows(section: HTMLElement) {
  // Prevent the older helper from creating its own asset pills again.
  section.dataset.assetPillsReady = "true";

  section.querySelectorAll("[data-asset-pills], [data-bust-asset-filter-row]").forEach((row) => {
    if (row instanceof HTMLElement && !row.dataset.bustStrictAssetFilters) row.remove();
  });
}

function ensureFilterRow(section: HTMLElement) {
  let row = section.querySelector<HTMLElement>('[data-bust-strict-asset-filters="true"]');
  if (row) return row;

  row = document.createElement("div");
  row.dataset.bustStrictAssetFilters = "true";
  row.className = "my-4 flex flex-wrap gap-2";

  filters.forEach(([id, label], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.assetFilter = id;
    button.className = buttonClass(index === 0);
    button.textContent = label;
    row?.appendChild(button);
  });

  const gallery = section.querySelector("[data-bust-asset-gallery='true']");
  const fallbackTarget = Array.from(section.children).find((child) => {
    if (!(child instanceof HTMLElement)) return false;
    return child.className.toString().includes("mt-5") || child.className.toString().includes("grid gap");
  });

  section.insertBefore(row, gallery || fallbackTarget || section.children[3] || null);
  return row;
}

function cardMatchesFilter(card: HTMLElement, filter: string) {
  if (isLogoCard(card)) return false;

  const text = normalize(card.textContent || "");
  if (filter === "all") return true;
  if (filter === "reference") return text.includes("reference") || text.includes("referencia");
  if (filter === "product") return text.includes("product") || text.includes("producto") || text.includes("anuncio de producto");
  if (filter === "element") return text.includes("element") || text.includes("elemento") || text.includes("icono") || text.includes("sticker") || text.includes("textura");
  if (filter === "stock") return text.includes("stock");
  if (filter === "featured") return text.includes("destacado");

  return true;
}

function applyFilter(section: HTMLElement, filter: string) {
  section.dataset.activeAssetGalleryFilter = filter;

  getAssetCards(section).forEach((card) => {
    if (isLogoCard(card)) {
      card.style.setProperty("display", "none", "important");
      return;
    }

    if (cardMatchesFilter(card, filter)) {
      card.style.removeProperty("display");
    } else {
      card.style.setProperty("display", "none", "important");
    }
  });
}

function setActiveButton(row: HTMLElement, activeButton: HTMLButtonElement) {
  row.querySelectorAll("button").forEach((button) => {
    if (button instanceof HTMLButtonElement) button.className = buttonClass(button === activeButton);
  });
}

function wireFilterRow(section: HTMLElement, row: HTMLElement) {
  row.querySelectorAll("button").forEach((button) => {
    if (!(button instanceof HTMLButtonElement) || wiredButtons.has(button)) return;
    wiredButtons.add(button);

    button.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      },
      true,
    );

    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const filter = button.dataset.assetFilter || "all";
        setActiveButton(row, button);
        applyFilter(section, filter);
      },
      true,
    );
  });
}

function run() {
  if (!isBriefPage()) return;
  const section = getAssetSection();
  if (!section) return;

  removeCompetingFilterRows(section);
  const row = ensureFilterRow(section);
  wireFilterRow(section, row);
  applyFilter(section, section.dataset.activeAssetGalleryFilter || "all");
}

export default function AssetGalleryFilterController() {
  useEffect(() => {
    run();

    let frame: number | null = null;
    const scheduleRun = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        run();
      });
    };

    const observer = new MutationObserver(scheduleRun);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}

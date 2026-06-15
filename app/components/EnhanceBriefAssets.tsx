"use client";

import { useEffect } from "react";

const styleId = "bust-asset-gallery-style";
const visualFilters = new Set(["todos", "referencias", "referencia", "producto", "elementos", "elemento", "stock", "destacados", "destacado"]);

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

function isNewGeneratorPage() {
  return window.location.pathname === "/dashboard/generador";
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

function injectStyles() {
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    [data-bust-asset-gallery="true"] {
      display: grid !important;
      gap: 3px !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      width: 100% !important;
      align-items: start !important;
    }

    [data-bust-asset-gallery="true"] > *:not([data-bust-asset-card="true"]) {
      grid-column: 1 / -1 !important;
    }

    [data-bust-asset-card="true"] {
      aspect-ratio: 1 / 1 !important;
      background: #e4e4e7 !important;
      border: 0 !important;
      border-radius: 5px !important;
      box-shadow: none !important;
      display: block !important;
      margin: 0 !important;
      min-height: 0 !important;
      min-width: 0 !important;
      overflow: hidden !important;
      padding: 0 !important;
      position: relative !important;
      width: 100% !important;
    }

    [data-bust-asset-card="true"]::after {
      background: linear-gradient(180deg, rgba(0,0,0,0) 46%, rgba(0,0,0,.62) 100%);
      bottom: 0;
      content: "";
      left: 0;
      opacity: .9;
      pointer-events: none;
      position: absolute;
      right: 0;
      top: 0;
      z-index: 1;
    }

    [data-bust-asset-card="true"][data-selected="true"] {
      box-shadow: 0 0 0 3px rgba(34,197,94,.95) inset !important;
    }

    [data-bust-asset-image-box="true"] {
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      height: 100% !important;
      inset: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      padding: 0 !important;
      position: absolute !important;
      width: 100% !important;
      z-index: 0 !important;
    }

    [data-bust-asset-image-box="true"] img {
      display: block !important;
      height: 100% !important;
      object-fit: cover !important;
      padding: 0 !important;
      width: 100% !important;
    }

    [data-bust-asset-caption="true"] {
      background: transparent !important;
      bottom: 0 !important;
      left: 0 !important;
      min-width: 0 !important;
      padding: 8px !important;
      position: absolute !important;
      right: 0 !important;
      z-index: 2 !important;
    }

    [data-bust-asset-caption="true"] p {
      color: #fff !important;
      display: -webkit-box !important;
      font-size: 10px !important;
      font-weight: 750 !important;
      letter-spacing: -.01em !important;
      line-height: 1.1 !important;
      margin: 0 !important;
      overflow: hidden !important;
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 2 !important;
    }

    [data-bust-asset-caption="true"] span,
    [data-bust-asset-caption="true"] .text-xs {
      color: rgba(255,255,255,.78) !important;
      display: block !important;
      font-size: 8px !important;
      font-weight: 800 !important;
      letter-spacing: .08em !important;
      margin-top: 3px !important;
      text-transform: uppercase !important;
    }

    [data-bust-asset-status="true"] {
      align-items: center !important;
      background: rgba(255,255,255,.94) !important;
      border-radius: 999px !important;
      color: #18181b !important;
      display: inline-flex !important;
      font-size: 0 !important;
      font-weight: 900 !important;
      height: 22px !important;
      justify-content: center !important;
      pointer-events: none !important;
      position: absolute !important;
      right: 6px !important;
      top: 6px !important;
      width: 22px !important;
      z-index: 3 !important;
    }

    [data-bust-asset-status="true"]::before {
      content: "+";
      font-size: 15px;
      line-height: 1;
    }

    [data-bust-asset-card="true"][data-selected="true"] [data-bust-asset-status="true"] {
      background: rgba(34,197,94,.98) !important;
      color: #fff !important;
    }

    [data-bust-asset-card="true"][data-selected="true"] [data-bust-asset-status="true"]::before {
      content: "✓";
      font-size: 13px;
    }

    [data-bust-asset-check="true"],
    [data-bust-asset-control-row="true"] {
      display: none !important;
    }

    [data-bust-asset-filter-row="true"] {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      margin: 10px 0 14px !important;
      width: 100% !important;
    }

    [data-bust-asset-filter-row="true"] button {
      border-radius: 999px !important;
      font-size: 11px !important;
      min-height: 28px !important;
      padding: 6px 11px !important;
    }

    @media (max-width: 760px) {
      [data-bust-asset-gallery="true"] {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function hideLogoPills(section: HTMLElement) {
  section.querySelectorAll("button").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const text = normalize(button.textContent || "");

    if (text === "logos" || text === "logo") {
      button.style.display = "none";
      button.dataset.bustAssetEnhancerControl = "true";
      return;
    }

    if (visualFilters.has(text)) {
      const row = button.parentElement;
      if (row instanceof HTMLElement) row.dataset.bustAssetFilterRow = "true";
    }
  });
}

function getAssetCards(section: HTMLElement) {
  return Array.from(section.querySelectorAll("button.rounded-3xl, div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    if (card.dataset.bustAssetEnhancerControl === "true") return false;
    if (card.closest("[data-client-block-library]")) return false;
    if (card.closest("[data-bust-asset-filter-row]")) return false;
    return Boolean(card.querySelector("img")) || normalize(card.textContent || "").includes("usar") || normalize(card.textContent || "").includes("omitir");
  });
}

function clearDefaultSelectedAssets(cards: HTMLElement[]) {
  if (!isNewGeneratorPage()) return;

  cards.forEach((card) => {
    if (card.dataset.bustDefaultCleared === "true") return;
    card.dataset.bustDefaultCleared = "true";

    const text = normalize(card.textContent || "");
    if (!text.includes("usar")) return;

    card.click();
  });
}

function findGalleryContainer(section: HTMLElement, cards: HTMLElement[]) {
  const candidates = Array.from(section.querySelectorAll("div")).filter((candidate): candidate is HTMLElement => {
    if (!(candidate instanceof HTMLElement)) return false;
    const directCardCount = Array.from(candidate.children).filter((child) => cards.includes(child as HTMLElement)).length;
    return directCardCount >= 2;
  });

  return candidates[0] || cards[0]?.parentElement || null;
}

function clearWrongGalleryMarkers(section: HTMLElement, gallery: HTMLElement | null) {
  section.querySelectorAll<HTMLElement>("[data-bust-asset-gallery]").forEach((element) => {
    if (element !== gallery) delete element.dataset.bustAssetGallery;
  });
}

function styleImage(card: HTMLElement) {
  const image = card.querySelector("img");
  const imageBox = image?.parentElement;

  if (imageBox instanceof HTMLElement) {
    imageBox.dataset.bustAssetImageBox = "true";
    imageBox.style.height = "";
  }
}

function styleCaption(card: HTMLElement) {
  const grid = card.querySelector("div.grid");
  const info = grid?.querySelector(".min-w-0");
  const controlRow = Array.from(card.children).find((child) => {
    return child instanceof HTMLElement && (normalize(child.textContent || "").includes("usar") || normalize(child.textContent || "").includes("omitir"));
  });

  if (grid instanceof HTMLElement) {
    grid.style.display = "block";
    grid.style.padding = "0";
    grid.style.gap = "0";
  }

  if (info instanceof HTMLElement) {
    info.dataset.bustAssetCaption = "true";
  }

  if (controlRow instanceof HTMLElement) {
    controlRow.dataset.bustAssetControlRow = "true";
  }
}

function updateSelectionState(card: HTMLElement) {
  const selected = normalize(card.textContent || "").includes("usar");
  card.dataset.selected = selected ? "true" : "false";

  let status = card.querySelector<HTMLElement>("[data-bust-asset-status]");
  if (!status) {
    status = document.createElement("span");
    status.dataset.bustAssetStatus = "true";
    card.appendChild(status);
  }

  status.setAttribute("aria-label", selected ? "Seleccionado" : "Agregar al brief");
}

function enhanceCards(section: HTMLElement) {
  injectStyles();
  hideLogoPills(section);

  const cards = getAssetCards(section);
  clearDefaultSelectedAssets(cards);

  const gallery = findGalleryContainer(section, cards);
  clearWrongGalleryMarkers(section, gallery);
  if (gallery) gallery.dataset.bustAssetGallery = "true";

  cards.forEach((card) => {
    if (isLogoCard(card)) {
      card.style.display = "none";
      card.dataset.logoAssetHidden = "true";
      return;
    }

    card.dataset.bustAssetCard = "true";
    styleImage(card);
    styleCaption(card);
    updateSelectionState(card);
  });
}

function run() {
  if (!isBriefPage()) return;
  const section = getAssetSection();
  if (!section) return;
  enhanceCards(section);
}

export default function EnhanceBriefAssets() {
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

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

function getAssetSection() {
  return Array.from(document.querySelectorAll("section")).find((section): section is HTMLElement => {
    return section instanceof HTMLElement && normalize(section.textContent || "").includes("assets del cliente");
  });
}

function isLogoCard(card: HTMLElement) {
  const text = normalize(card.textContent || "");
  return text.includes("logo") || text.includes("logotipo") || text.includes("imagotipo") || text.includes("isotipo");
}

function injectStyles() {
  const oldStyle = document.getElementById(styleId);
  oldStyle?.remove();

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    [data-bust-asset-gallery="true"] {
      display: grid !important;
      gap: 18px !important;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
      width: 100% !important;
      align-items: start !important;
    }

    [data-bust-asset-card="true"] {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      border-radius: 22px !important;
      border: 1px solid rgba(24,24,27,0.1) !important;
      background: rgba(255,255,255,0.96) !important;
      box-shadow: 0 14px 38px rgba(24,24,27,0.08) !important;
      position: relative !important;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }

    [data-bust-asset-card="true"]:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 50px rgba(24,24,27,0.14) !important;
      border-color: rgba(24,24,27,0.22) !important;
    }

    [data-bust-asset-card="true"][data-selected="true"] {
      border-color: rgba(22,101,52,0.92) !important;
      box-shadow: 0 0 0 3px rgba(34,197,94,0.28), 0 18px 44px rgba(22,101,52,0.16) !important;
    }

    [data-bust-asset-image-box="true"] {
      width: 100% !important;
      min-height: 220px !important;
      border: 0 !important;
      background: #f4f4f5 !important;
      border-radius: 22px 22px 0 0 !important;
      padding: 10px !important;
      overflow: hidden !important;
    }

    [data-bust-asset-image-box="true"] img {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      display: block !important;
    }

    [data-bust-asset-caption="true"] {
      padding: 12px 14px 4px !important;
      background: rgba(255,255,255,0.96) !important;
    }

    [data-bust-asset-status="true"] {
      align-items: center;
      border-radius: 999px;
      display: inline-flex;
      font-size: 11px;
      font-weight: 800;
      gap: 6px;
      letter-spacing: .01em;
      line-height: 1;
      padding: 8px 11px;
      pointer-events: none;
      position: absolute;
      right: 10px;
      top: 10px;
      z-index: 3;
    }

    [data-bust-asset-card="true"][data-selected="true"] [data-bust-asset-status="true"] {
      background: rgba(22,101,52,.96);
      color: #fff;
    }

    [data-bust-asset-card="true"][data-selected="false"] [data-bust-asset-status="true"] {
      background: rgba(255,255,255,.92);
      border: 1px solid rgba(24,24,27,.12);
      color: #18181b;
      box-shadow: 0 8px 24px rgba(24,24,27,.12);
    }

    [data-bust-asset-check="true"] {
      align-items: center;
      background: rgba(22,101,52,.96);
      border-radius: 999px;
      color: white;
      display: flex;
      font-size: 13px;
      font-weight: 900;
      height: 28px;
      justify-content: center;
      opacity: 0;
      position: absolute;
      left: 10px;
      top: 10px;
      transform: scale(.9);
      transition: opacity .18s ease, transform .18s ease;
      width: 28px;
      z-index: 3;
    }

    [data-bust-asset-card="true"][data-selected="true"] [data-bust-asset-check="true"] {
      opacity: 1;
      transform: scale(1);
    }

    [data-bust-asset-control-row="true"] {
      display: none !important;
    }

    [data-bust-asset-filter-row="true"] {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      margin: 12px 0 18px !important;
    }

    [data-bust-asset-filter-row="true"] button {
      border-radius: 999px !important;
      font-size: 11px !important;
      min-height: 28px !important;
      padding: 6px 11px !important;
    }

    @media (max-width: 1180px) {
      [data-bust-asset-gallery="true"] {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)) !important;
      }
    }

    @media (max-width: 760px) {
      [data-bust-asset-gallery="true"] {
        grid-template-columns: 1fr !important;
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

function findGalleryContainer(cards: HTMLElement[]) {
  const first = cards[0];
  if (!first?.parentElement) return null;
  return first.parentElement;
}

function setImageRatio(card: HTMLElement, index: number) {
  const image = card.querySelector("img");
  const imageBox = image?.parentElement;
  if (!(imageBox instanceof HTMLElement)) return;

  imageBox.dataset.bustAssetImageBox = "true";

  const presetHeights = [280, 240, 320, 260, 300, 250, 340, 270];
  const applyNaturalRatio = () => {
    if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) {
      imageBox.style.height = `${presetHeights[index % presetHeights.length]}px`;
      return;
    }

    const ratio = image.naturalWidth / image.naturalHeight;
    const height = ratio > 1.45 ? 240 : ratio < 0.76 ? 340 : 290;
    imageBox.style.height = `${height}px`;
  };

  if (image instanceof HTMLImageElement) {
    if (image.complete) applyNaturalRatio();
    else image.addEventListener("load", applyNaturalRatio, { once: true });
  } else {
    imageBox.style.height = `${presetHeights[index % presetHeights.length]}px`;
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

    const title = info.querySelector("p");
    if (title instanceof HTMLElement) {
      title.style.fontSize = "13px";
      title.style.fontWeight = "650";
      title.style.lineHeight = "1.25";
      title.style.letterSpacing = "-0.01em";
    }

    const meta = info.querySelector("span, .text-xs");
    if (meta instanceof HTMLElement) {
      meta.style.fontSize = "10px";
      meta.style.color = "#71717a";
      meta.style.letterSpacing = "0.02em";
      meta.style.textTransform = "uppercase";
    }
  }

  if (controlRow instanceof HTMLElement) {
    controlRow.dataset.bustAssetControlRow = "true";
  }
}

function updateSelectionState(card: HTMLElement) {
  const text = normalize(card.textContent || "");
  const selected = text.includes("omitir");
  card.dataset.selected = selected ? "true" : "false";

  const existingCheck = card.querySelector("[data-bust-asset-check]");
  const check = existingCheck instanceof HTMLElement ? existingCheck : document.createElement("span");
  if (!(existingCheck instanceof HTMLElement)) {
    check.dataset.bustAssetCheck = "true";
    check.textContent = "✓";
    card.appendChild(check);
  }

  const existingStatus = card.querySelector("[data-bust-asset-status]");
  const status = existingStatus instanceof HTMLElement ? existingStatus : document.createElement("span");
  if (!(existingStatus instanceof HTMLElement)) {
    status.dataset.bustAssetStatus = "true";
    card.appendChild(status);
  }

  status.textContent = selected ? "Seleccionado ✓" : "Agregar al brief";
}

function enhanceCards(section: HTMLElement) {
  injectStyles();
  hideLogoPills(section);

  const cards = getAssetCards(section);
  const gallery = findGalleryContainer(cards);
  if (gallery) {
    gallery.dataset.bustAssetGallery = "true";
  }

  cards.forEach((card, index) => {
    if (isLogoCard(card)) {
      card.style.display = "none";
      card.dataset.logoAssetHidden = "true";
      return;
    }

    card.dataset.bustAssetCard = "true";
    setImageRatio(card, index);
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
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

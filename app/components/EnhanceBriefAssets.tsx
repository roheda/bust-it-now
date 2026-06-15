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
      column-count: 2;
      column-gap: 10px;
      display: block !important;
    }

    [data-bust-asset-card="true"] {
      break-inside: avoid;
      display: inline-block !important;
      width: 100% !important;
      margin: 0 0 10px !important;
      padding: 0 !important;
      overflow: hidden !important;
      border-radius: 18px !important;
      border: 1px solid rgba(24,24,27,0.08) !important;
      background: rgba(250,250,250,0.95) !important;
      box-shadow: 0 12px 30px rgba(24,24,27,0.08) !important;
      position: relative !important;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }

    [data-bust-asset-card="true"]:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 45px rgba(24,24,27,0.14) !important;
      border-color: rgba(24,24,27,0.22) !important;
    }

    [data-bust-asset-card="true"][data-selected="true"] {
      border-color: rgba(24,24,27,0.85) !important;
      box-shadow: 0 0 0 2px rgba(24,24,27,0.85), 0 16px 36px rgba(24,24,27,0.16) !important;
    }

    [data-bust-asset-image-box="true"] {
      width: 100% !important;
      border: 0 !important;
      background: #f4f4f5 !important;
      border-radius: 18px 18px 0 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    [data-bust-asset-image-box="true"] img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      display: block !important;
    }

    [data-bust-asset-caption="true"] {
      padding: 9px 10px 10px !important;
      background: rgba(255,255,255,0.92) !important;
    }

    [data-bust-asset-check="true"] {
      align-items: center;
      background: rgba(24,24,27,.92);
      border-radius: 999px;
      color: white;
      display: flex;
      font-size: 12px;
      font-weight: 800;
      height: 24px;
      justify-content: center;
      opacity: 0;
      position: absolute;
      right: 9px;
      top: 9px;
      transform: scale(.9);
      transition: opacity .18s ease, transform .18s ease;
      width: 24px;
      z-index: 2;
    }

    [data-bust-asset-card="true"][data-selected="true"] [data-bust-asset-check="true"] {
      opacity: 1;
      transform: scale(1);
    }

    [data-bust-asset-control-row="true"] {
      padding: 0 10px 10px !important;
      background: rgba(255,255,255,0.92) !important;
    }

    [data-bust-asset-filter-row="true"] {
      gap: 6px !important;
      margin: 12px 0 14px !important;
    }

    [data-bust-asset-filter-row="true"] button {
      border-radius: 999px !important;
      font-size: 11px !important;
      min-height: 28px !important;
      padding: 6px 10px !important;
    }

    @media (max-width: 1100px) {
      [data-bust-asset-gallery="true"] { column-count: 3; }
    }

    @media (max-width: 760px) {
      [data-bust-asset-gallery="true"] { column-count: 2; }
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

  const presetHeights = [172, 132, 205, 150, 188, 140, 216, 160];
  const applyNaturalRatio = () => {
    if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) {
      imageBox.style.height = `${presetHeights[index % presetHeights.length]}px`;
      return;
    }

    const ratio = image.naturalWidth / image.naturalHeight;
    const height = ratio > 1.35 ? 124 : ratio < 0.78 ? 214 : 168;
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
      title.style.fontSize = "12px";
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

function addSelectionCheck(card: HTMLElement) {
  const text = normalize(card.textContent || "");
  card.dataset.selected = text.includes("omitir") ? "true" : "false";

  if (card.querySelector("[data-bust-asset-check]")) return;
  const check = document.createElement("span");
  check.dataset.bustAssetCheck = "true";
  check.textContent = "✓";
  card.appendChild(check);
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
    addSelectionCheck(card);
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

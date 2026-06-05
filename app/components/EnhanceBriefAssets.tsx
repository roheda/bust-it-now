"use client";

import { useEffect } from "react";

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
  return text.includes("logo") || text.includes("logotipo");
}

function getAssetCards(section: HTMLElement) {
  return Array.from(section.querySelectorAll("button.rounded-3xl, div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    if (card.dataset.assetEnhancerControl === "true") return false;
    if (card.closest("[data-client-block-library]")) return false;
    return true;
  });
}

function hideLogoPills(section: HTMLElement) {
  section.querySelectorAll("button").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const text = normalize(button.textContent || "");
    if (text === "logos" || text === "logo") {
      button.style.display = "none";
      button.dataset.assetEnhancerControl = "true";
    }
  });
}

function enhanceCards(section: HTMLElement) {
  hideLogoPills(section);

  getAssetCards(section).forEach((card) => {
    if (isLogoCard(card)) {
      card.style.display = "none";
      card.dataset.logoAssetHidden = "true";
      return;
    }

    card.dataset.assetPreviewEnhanced = "true";
    card.classList.add("overflow-hidden");
    card.style.padding = "0";

    const image = card.querySelector("img");
    const imageBox = image?.parentElement;
    const grid = card.querySelector("div.grid");
    const info = grid?.querySelector(".min-w-0");
    const statusRow = Array.from(card.children).find((child) => {
      return child instanceof HTMLElement && normalize(child.textContent || "").includes("usar");
    });

    if (grid instanceof HTMLElement) {
      grid.style.display = "block";
      grid.style.padding = "0";
    }

    if (imageBox instanceof HTMLElement) {
      imageBox.style.width = "100%";
      imageBox.style.height = "160px";
      imageBox.style.borderRadius = "1.4rem 1.4rem 0 0";
      imageBox.style.border = "0";
      imageBox.style.background = "#f4f4f5";
      imageBox.style.padding = "0.65rem";
    }

    if (image instanceof HTMLImageElement) {
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = "contain";
      image.className = "h-full w-full object-contain";
    }

    if (info instanceof HTMLElement) {
      info.style.padding = "0.85rem 0.9rem 0.25rem";
    }

    if (statusRow instanceof HTMLElement) {
      statusRow.style.padding = "0 0.9rem 0.9rem";
    }
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

"use client";

import { useEffect } from "react";

function hideBriefControls() {
  if (typeof window === "undefined") return;

  const pathname = window.location.pathname;
  const isGeneratorBriefPage = pathname === "/dashboard/generador" || pathname.startsWith("/dashboard/generador/editar/");

  if (!isGeneratorBriefPage) return;

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

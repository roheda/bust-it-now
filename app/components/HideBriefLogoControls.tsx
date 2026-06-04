"use client";

import { useEffect } from "react";

function hideLogoBriefControls() {
  if (typeof window === "undefined") return;

  const pathname = window.location.pathname;
  const isGeneratorBriefPage = pathname === "/dashboard/generador" || pathname.startsWith("/dashboard/generador/editar/");

  if (!isGeneratorBriefPage) return;

  const allElements = Array.from(document.querySelectorAll("p, label, button, span"));

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
  });
}

export default function HideBriefLogoControls() {
  useEffect(() => {
    hideLogoBriefControls();

    const observer = new MutationObserver(() => {
      hideLogoBriefControls();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

"use client";

import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useEffect } from "react";
import { auth, db } from "@/lib/firebase";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getRequestId() {
  const match = window.location.pathname.match(/\/dashboard\/generador\/([^/]+)/);
  if (!match) return "";
  if (match[1] === "editar") return "";
  return decodeURIComponent(match[1]);
}

function getGeneratedImageId(card: HTMLElement) {
  const downloadLink = Array.from(card.querySelectorAll("a[download]")).find((link) => {
    return link instanceof HTMLAnchorElement && link.download.startsWith("bust-it-now-");
  });

  if (!(downloadLink instanceof HTMLAnchorElement)) return "";

  return downloadLink.download
    .replace(/^bust-it-now-/, "")
    .replace(/\.png$/i, "")
    .trim();
}

function findGeneratedCards() {
  return Array.from(document.querySelectorAll("section div.rounded-3xl")).filter((card): card is HTMLElement => {
    if (!(card instanceof HTMLElement)) return false;
    const image = card.querySelector('img[alt="Imagen generada"]');
    return image instanceof HTMLImageElement && Boolean(getGeneratedImageId(card));
  });
}

function buildAssetName(clientName: string, imageId: string) {
  const cleanClient = clientName || "Cliente";
  return `Referencia visual - ${cleanClient} - ${imageId.slice(0, 6)}`;
}

async function saveGeneratedImageAsAsset(card: HTMLElement) {
  const requestId = getRequestId();
  const imageId = getGeneratedImageId(card);
  const image = card.querySelector('img[alt="Imagen generada"]');

  if (!requestId || !imageId || !(image instanceof HTMLImageElement)) {
    window.alert("No pude identificar esta imagen para guardarla como asset.");
    return;
  }

  const button = card.querySelector<HTMLButtonElement>('[data-save-generated-asset="true"]');
  if (button) {
    button.disabled = true;
    button.textContent = "Guardando...";
  }

  try {
    const requestSnapshot = await getDoc(doc(db, "generationRequests", requestId));
    const imageSnapshot = await getDoc(doc(db, "generatedImages", imageId));

    if (!requestSnapshot.exists()) throw new Error("No encontramos el request.");
    if (!imageSnapshot.exists()) throw new Error("No encontramos la imagen generada.");

    const requestData = requestSnapshot.data();
    const imageData = imageSnapshot.data();
    const clientId = typeof requestData.clientId === "string" ? requestData.clientId : "";
    const clientName = typeof requestData.clientName === "string" ? requestData.clientName : "";

    if (!clientId) throw new Error("Este request no tiene cliente asociado.");

    const imageUrl = typeof imageData.imageUrl === "string" ? imageData.imageUrl : image.src;
    const storagePath = typeof imageData.storagePath === "string" ? imageData.storagePath : "";
    const format = typeof requestData.format === "string" ? requestData.format : "social-media";
    const goal = typeof requestData.goal === "string" ? requestData.goal : "";
    const contentType = typeof requestData.contentType === "string" ? requestData.contentType : "";

    const assetRef = await addDoc(collection(db, "clientAssets"), {
      clientId,
      clientName,
      name: buildAssetName(clientName, imageId),
      type: "reference",
      category: "referencia",
      tags: ["referencia", "aprobada", "generada", "bust-it-now", format].filter(Boolean),
      notes: `Referencia visual aprobada desde una imagen generada en BUST IT NOW.${goal ? ` Objetivo: ${goal}.` : ""}${contentType ? ` Tipo: ${contentType}.` : ""}`,
      fileUrl: imageUrl,
      storagePath,
      mimeType: "image/png",
      isFeatured: true,
      source: "generated-image",
      sourceRequestId: requestId,
      sourceGeneratedImageId: imageId,
      createdBy: auth.currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "generatedImages", imageId), {
      savedAsAsset: true,
      assetId: assetRef.id,
      liked: true,
      feedback: "positive",
      savedAsAssetAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    card.dataset.generatedAssetSaved = "true";
    if (button) {
      button.textContent = "Asset guardado";
      button.className = "inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-80";
    }
  } catch (error) {
    console.error(error);
    if (button) {
      button.disabled = false;
      button.textContent = "Guardar Asset";
    }
    window.alert(error instanceof Error ? error.message : "No pude guardar el asset.");
  }
}

function enhanceGeneratedCards() {
  if (!getRequestId()) return;

  findGeneratedCards().forEach((card) => {
    if (card.dataset.assetSaverReady === "true") return;
    card.dataset.assetSaverReady = "true";

    const oldButton = Array.from(card.querySelectorAll("button")).find((button) => {
      return normalize(button.textContent || "").includes("guardar como referencia") || normalize(button.textContent || "").includes("guardada como referencia");
    });

    if (oldButton instanceof HTMLButtonElement) {
      const alreadySaved = normalize(oldButton.textContent || "").includes("guardada");
      oldButton.style.display = "none";

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.saveGeneratedAsset = "true";
      button.disabled = alreadySaved;
      button.textContent = alreadySaved ? "Asset guardado" : "Guardar Asset";
      button.className = alreadySaved
        ? "inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-80"
        : "inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100";
      button.addEventListener("click", () => saveGeneratedImageAsAsset(card));
      oldButton.insertAdjacentElement("afterend", button);
    }
  });
}

export default function GeneratedAssetSaverWidget() {
  useEffect(() => {
    enhanceGeneratedCards();
    const observer = new MutationObserver(enhanceGeneratedCards);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

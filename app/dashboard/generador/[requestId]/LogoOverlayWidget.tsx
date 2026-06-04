"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

type LogoOverlay = {
  enabled?: boolean;
  fileUrl?: string;
  assetName?: string;
  position?: string;
  size?: string;
};

type GeneratedImage = {
  id: string;
  imageUrl: string;
  storagePath?: string;
  logoOverlayApplied?: boolean;
  logoOverlayAppliedAt?: unknown;
};

type RequestInfo = {
  clientId?: string;
  clientName?: string;
  logoOverlay?: LogoOverlay;
};

function logoPositionLabel(position?: string) {
  const map: Record<string, string> = {
    "top-left": "superior izquierda",
    "top-right": "superior derecha",
    "bottom-left": "inferior izquierda",
    "bottom-right": "inferior derecha",
    "bottom-center": "inferior centro",
  };

  return map[position || ""] || "posición seleccionada";
}

function logoSizeLabel(size?: string) {
  const map: Record<string, string> = {
    small: "chico",
    medium: "mediano",
    large: "grande",
  };

  return map[size || ""] || "mediano";
}

export default function LogoOverlayWidget() {
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId;

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen, requestId]);

  async function loadData() {
    setIsLoading(true);
    setMessage("");

    try {
      const requestSnapshot = await getDoc(doc(db, "generationRequests", requestId));
      const requestData = requestSnapshot.exists()
        ? (requestSnapshot.data() as RequestInfo)
        : null;

      setRequestInfo(requestData);

      const imagesSnapshot = await getDocs(
        query(collection(db, "generatedImages"), where("requestId", "==", requestId)),
      );

      const loadedImages = imagesSnapshot.docs
        .map((imageDocument) => {
          const data = imageDocument.data();

          return {
            id: imageDocument.id,
            imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
            storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
            logoOverlayApplied: data.logoOverlayApplied === true,
            logoOverlayAppliedAt: data.logoOverlayAppliedAt,
          } satisfies GeneratedImage;
        })
        .filter((image) => image.imageUrl);

      setImages(loadedImages);
      setSelectedImageId((currentImageId) => {
        const exists = loadedImages.some((image) => image.id === currentImageId);
        return exists ? currentImageId : loadedImages[0]?.id || "";
      });
    } catch (error) {
      console.error(error);
      setMessage("No pudimos cargar imágenes o configuración del logo.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApplyLogo() {
    const selectedImage = images.find((image) => image.id === selectedImageId);
    const logoOverlay = requestInfo?.logoOverlay;

    if (!selectedImage) {
      setMessage("Selecciona una imagen.");
      return;
    }

    if (!logoOverlay?.enabled || !logoOverlay.fileUrl) {
      setMessage("Este request no tiene logo configurado. Vuelve al brief y activa el logo post-generación.");
      return;
    }

    setIsApplying(true);
    setMessage("");

    try {
      const response = await fetch("/api/apply-logo-overlay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: selectedImage.imageUrl,
          logoOverlay,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No pudimos aplicar el logo.");
      }

      if (typeof result.imageBase64 !== "string" || !result.imageBase64.length) {
        throw new Error("El servidor no devolvió la imagen con logo.");
      }

      const storagePath = `generated-images/${
        requestInfo?.clientId || "unknown-client"
      }/${requestId}/logo-overlay-${selectedImage.id}-${Date.now()}.png`;
      const storageRef = ref(storage, storagePath);

      await uploadString(storageRef, result.imageBase64, "base64", {
        contentType: "image/png",
      });

      const imageUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "generatedImages", selectedImage.id), {
        originalImageUrl: selectedImage.imageUrl,
        originalStoragePath: selectedImage.storagePath || "",
        imageUrl,
        storagePath,
        logoOverlayApplied: true,
        logoOverlayConfig: logoOverlay,
        logoOverlayAppliedBy: auth.currentUser?.uid ?? null,
        logoOverlayAppliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage("Logo aplicado correctamente. La imagen ya se actualizó con el logo real.");
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos aplicar el logo a esta imagen.",
      );
    } finally {
      setIsApplying(false);
    }
  }

  const logoOverlay = requestInfo?.logoOverlay;
  const selectedImage = images.find((image) => image.id === selectedImageId);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-50 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-zinc-800"
      >
        🏷️ Logo post-generación
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default"
          />

          <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <header className="bg-zinc-950 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Capa fija posterior
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Aplicar logo real
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    El logo se coloca después de generar la imagen para evitar deformaciones.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full border border-white/10 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Cerrar
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {isLoading ? (
                <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                  Cargando configuración...
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-sm font-semibold text-zinc-900">
                      Configuración del logo
                    </p>
                    {logoOverlay?.enabled && logoOverlay.fileUrl ? (
                      <div className="mt-3 grid grid-cols-[88px_1fr] items-center gap-4">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-2">
                          <img
                            src={logoOverlay.fileUrl}
                            alt={logoOverlay.assetName || "Logo"}
                            className="h-16 w-full object-contain"
                          />
                        </div>
                        <div className="text-sm leading-6 text-zinc-600">
                          <p className="font-semibold text-zinc-900">
                            {logoOverlay.assetName || "Logo seleccionado"}
                          </p>
                          <p>Posición: {logoPositionLabel(logoOverlay.position)}</p>
                          <p>Tamaño: {logoSizeLabel(logoOverlay.size)}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        Este request no tiene logo activo. Regresa al brief, activa el logo post-generación y selecciona el asset del logo.
                      </p>
                    )}
                  </div>

                  {images.length === 0 ? (
                    <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                      Este request todavía no tiene imágenes generadas.
                    </p>
                  ) : (
                    <>
                      <div>
                        <p className="mb-3 text-sm font-semibold text-zinc-900">
                          Selecciona la imagen
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {images.map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              onClick={() => setSelectedImageId(image.id)}
                              className={`overflow-hidden rounded-2xl border bg-zinc-50 p-1 ${
                                selectedImageId === image.id
                                  ? "border-zinc-950"
                                  : "border-zinc-200"
                              }`}
                            >
                              <img
                                src={image.imageUrl}
                                alt="Imagen generada"
                                className="aspect-square w-full rounded-xl object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      {selectedImage ? (
                        <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-zinc-950">
                              Vista previa seleccionada
                            </p>
                            {selectedImage.logoOverlayApplied ? (
                              <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                                Logo aplicado
                              </span>
                            ) : null}
                          </div>
                          <img
                            src={selectedImage.imageUrl}
                            alt="Imagen seleccionada"
                            className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white"
                          />
                        </div>
                      ) : null}

                      {message ? (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
                          {message}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleApplyLogo}
                        disabled={isApplying || !logoOverlay?.enabled || !logoOverlay.fileUrl}
                        className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isApplying ? "Aplicando logo..." : "🏷️ Aplicar logo a esta imagen"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

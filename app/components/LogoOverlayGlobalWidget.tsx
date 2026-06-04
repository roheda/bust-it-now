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
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

type AssetRecord = {
  id: string;
  name: string;
  type: string;
  category: string;
  tags: string[];
  fileUrl: string;
  storagePath?: string;
  mimeType?: string;
};

type GeneratedImage = {
  id: string;
  imageUrl: string;
  storagePath?: string;
  logoOverlayApplied?: boolean;
};

type RequestInfo = {
  clientId?: string;
  clientName?: string;
};

function getRequestIdFromPath(pathname: string | null) {
  if (!pathname) return "";
  if (!pathname.startsWith("/dashboard/generador/")) return "";
  if (pathname.startsWith("/dashboard/generador/editar/")) return "";

  const parts = pathname.split("/").filter(Boolean);
  const requestId = parts[2] || "";

  if (!requestId || requestId === "generador") return "";
  return requestId;
}

function isImageAsset(asset: AssetRecord) {
  const mimeType = asset.mimeType || "";
  const path = `${asset.fileUrl || ""} ${asset.storagePath || ""}`.toLowerCase();

  return (
    Boolean(asset.fileUrl) &&
    (mimeType.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(path) ||
      path.includes("firebasestorage.googleapis.com"))
  );
}

function isLogoAsset(asset: AssetRecord) {
  const type = (asset.type || "").toLowerCase();
  const category = (asset.category || "").toLowerCase();
  const tags = (asset.tags || []).map((tag) => tag.toLowerCase());

  return (
    isImageAsset(asset) &&
    (type === "logo" ||
      category === "logo" ||
      tags.includes("logo") ||
      tags.includes("logotipo"))
  );
}

export default function LogoOverlayGlobalWidget() {
  const pathname = usePathname();
  const requestId = useMemo(() => getRequestIdFromPath(pathname), [pathname]);

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [logoAssets, setLogoAssets] = useState<AssetRecord[]>([]);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [selectedLogoAssetId, setSelectedLogoAssetId] = useState("");
  const [xPercent, setXPercent] = useState(50);
  const [yPercent, setYPercent] = useState(88);
  const [widthPercent, setWidthPercent] = useState(20);

  useEffect(() => {
    setIsOpen(false);
    setMessage("");
  }, [requestId]);

  useEffect(() => {
    if (!isOpen || !requestId) return;
    loadData();
  }, [isOpen, requestId]);

  if (!requestId) return null;

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
          } satisfies GeneratedImage;
        })
        .filter((image) => image.imageUrl);

      setImages(loadedImages);
      setSelectedImageId((currentImageId) => {
        const exists = loadedImages.some((image) => image.id === currentImageId);
        return exists ? currentImageId : loadedImages[0]?.id || "";
      });

      if (requestData?.clientId) {
        const assetsSnapshot = await getDocs(
          query(collection(db, "clientAssets"), where("clientId", "==", requestData.clientId)),
        );

        const loadedLogoAssets = assetsSnapshot.docs
          .map((assetDocument) => {
            const data = assetDocument.data();

            return {
              id: assetDocument.id,
              name: typeof data.name === "string" ? data.name : "Logo sin nombre",
              type: typeof data.type === "string" ? data.type : "",
              category: typeof data.category === "string" ? data.category : "",
              tags: Array.isArray(data.tags) ? data.tags : [],
              fileUrl: typeof data.fileUrl === "string" ? data.fileUrl : "",
              storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
              mimeType: typeof data.mimeType === "string" ? data.mimeType : "",
            } satisfies AssetRecord;
          })
          .filter(isLogoAsset);

        setLogoAssets(loadedLogoAssets);
        setSelectedLogoAssetId((currentLogoId) => {
          const exists = loadedLogoAssets.some((asset) => asset.id === currentLogoId);
          return exists ? currentLogoId : loadedLogoAssets[0]?.id || "";
        });
      } else {
        setLogoAssets([]);
        setSelectedLogoAssetId("");
      }
    } catch (error) {
      console.error(error);
      setMessage("No pudimos cargar imágenes o logos del cliente.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApplyLogo() {
    const selectedImage = images.find((image) => image.id === selectedImageId);
    const selectedLogo = logoAssets.find((asset) => asset.id === selectedLogoAssetId);

    if (!selectedImage) {
      setMessage("Selecciona una imagen.");
      return;
    }

    if (!selectedLogo) {
      setMessage("Selecciona un logo de los assets del cliente.");
      return;
    }

    setIsApplying(true);
    setMessage("");

    try {
      const logoOverlay = {
        enabled: true,
        fileUrl: selectedLogo.fileUrl,
        assetId: selectedLogo.id,
        assetName: selectedLogo.name,
        xPercent,
        yPercent,
        widthPercent,
      };

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

  const selectedImage = images.find((image) => image.id === selectedImageId);
  const selectedLogo = logoAssets.find((asset) => asset.id === selectedLogoAssetId);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-[60] rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-zinc-800"
      >
        🏷️ Editor de logo
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex justify-end bg-zinc-950/30 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default"
          />

          <aside className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
            <header className="bg-zinc-950 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Logo post-generación
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Editor simple de logo
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Escoge un logo del cliente y ajusta X, Y y tamaño antes de aplicarlo.
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
                  Cargando editor...
                </p>
              ) : (
                <div className="space-y-5">
                  {images.length === 0 ? (
                    <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                      Este request todavía no tiene imágenes generadas.
                    </p>
                  ) : null}

                  {logoAssets.length === 0 ? (
                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
                      Este cliente no tiene assets en categoría, tipo o tag <strong>logo</strong>. Agrega el logo en assets del cliente y vuelve a abrir este editor.
                    </p>
                  ) : null}

                  {images.length > 0 ? (
                    <div>
                      <p className="mb-3 text-sm font-semibold text-zinc-900">
                        1. Selecciona la imagen
                      </p>
                      <div className="grid grid-cols-4 gap-3">
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
                  ) : null}

                  {logoAssets.length > 0 ? (
                    <div>
                      <p className="mb-3 text-sm font-semibold text-zinc-900">
                        2. Selecciona el logo
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {logoAssets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => setSelectedLogoAssetId(asset.id)}
                            className={`rounded-2xl border bg-white p-3 text-left transition ${
                              selectedLogoAssetId === asset.id
                                ? "border-zinc-950"
                                : "border-zinc-200 hover:bg-zinc-50"
                            }`}
                          >
                            <div className="flex h-16 items-center justify-center rounded-xl bg-zinc-50 p-2">
                              <img src={asset.fileUrl} alt={asset.name} className="max-h-full max-w-full object-contain" />
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs font-semibold text-zinc-800">
                              {asset.name}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedImage && selectedLogo ? (
                    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                      <div>
                        <p className="mb-3 text-sm font-semibold text-zinc-900">
                          3. Ajusta sobre la imagen
                        </p>
                        <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100">
                          <img
                            src={selectedImage.imageUrl}
                            alt="Imagen seleccionada"
                            className="w-full select-none"
                          />
                          <img
                            src={selectedLogo.fileUrl}
                            alt="Logo preview"
                            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-md"
                            style={{
                              left: `${xPercent}%`,
                              top: `${yPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                        <p className="text-sm font-semibold text-zinc-900">
                          Plano X / Y / Size
                        </p>

                        <label className="block text-sm font-medium text-zinc-800">
                          X: {xPercent}%
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={xPercent}
                            onChange={(event) => setXPercent(Number(event.target.value))}
                            className="mt-2 w-full"
                          />
                        </label>

                        <label className="block text-sm font-medium text-zinc-800">
                          Y: {yPercent}%
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={yPercent}
                            onChange={(event) => setYPercent(Number(event.target.value))}
                            className="mt-2 w-full"
                          />
                        </label>

                        <label className="block text-sm font-medium text-zinc-800">
                          Tamaño: {widthPercent}%
                          <input
                            type="range"
                            min="6"
                            max="60"
                            value={widthPercent}
                            onChange={(event) => setWidthPercent(Number(event.target.value))}
                            className="mt-2 w-full"
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <button type="button" onClick={() => { setXPercent(50); setYPercent(88); setWidthPercent(20); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Inferior centro</button>
                          <button type="button" onClick={() => { setXPercent(14); setYPercent(10); setWidthPercent(18); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Arriba izq.</button>
                          <button type="button" onClick={() => { setXPercent(86); setYPercent(10); setWidthPercent(18); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Arriba der.</button>
                          <button type="button" onClick={() => { setXPercent(86); setYPercent(90); setWidthPercent(18); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Abajo der.</button>
                        </div>
                      </div>
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
                    disabled={isApplying || !selectedImage || !selectedLogo}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isApplying ? "Aplicando logo..." : "🏷️ Aplicar logo con esta posición"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

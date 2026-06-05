"use client";

import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

type Asset = { id: string; name: string; type: string; category: string; tags: string[]; fileUrl: string; storagePath?: string; mimeType?: string };
type Img = { id: string; imageUrl: string; storagePath?: string; originalImageUrl?: string; originalStoragePath?: string; logoOverlayApplied?: boolean };
type Req = { clientId?: string; clientName?: string };

function requestIdFromPath(pathname: string | null) {
  if (!pathname?.startsWith("/dashboard/generador/") || pathname.startsWith("/dashboard/generador/editar/")) return "";
  return pathname.split("/").filter(Boolean)[2] || "";
}

function isLogo(asset: Asset) {
  const path = `${asset.fileUrl} ${asset.storagePath || ""}`.toLowerCase();
  const isImage = (asset.mimeType || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(path) || path.includes("firebasestorage.googleapis.com");
  const tags = (asset.tags || []).map((tag) => tag.toLowerCase());
  return isImage && ([asset.type, asset.category].some((v) => (v || "").toLowerCase() === "logo") || tags.includes("logo") || tags.includes("logotipo"));
}

export default function LogoOverlayEditorWidget() {
  const pathname = usePathname();
  const requestId = useMemo(() => requestIdFromPath(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [req, setReq] = useState<Req | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [logos, setLogos] = useState<Asset[]>([]);
  const [imageId, setImageId] = useState("");
  const [logoId, setLogoId] = useState("");
  const [x, setX] = useState(50);
  const [y, setY] = useState(88);
  const [size, setSize] = useState(20);

  useEffect(() => { setOpen(false); setMsg(""); }, [requestId]);
  useEffect(() => { if (open && requestId) load(); }, [open, requestId]);
  if (!requestId) return null;

  async function load() {
    setLoading(true); setMsg("");
    try {
      const reqSnap = await getDoc(doc(db, "generationRequests", requestId));
      const requestData = reqSnap.exists() ? (reqSnap.data() as Req) : null;
      setReq(requestData);

      const imgSnap = await getDocs(query(collection(db, "generatedImages"), where("requestId", "==", requestId)));
      const loadedImages = imgSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
          storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
          originalImageUrl: typeof data.originalImageUrl === "string" ? data.originalImageUrl : undefined,
          originalStoragePath: typeof data.originalStoragePath === "string" ? data.originalStoragePath : undefined,
          logoOverlayApplied: data.logoOverlayApplied === true,
        } satisfies Img;
      }).filter((img) => img.imageUrl);
      setImages(loadedImages);
      setImageId((cur) => loadedImages.some((img) => img.id === cur) ? cur : loadedImages[0]?.id || "");

      if (!requestData?.clientId) { setLogos([]); setLogoId(""); return; }
      const assetSnap = await getDocs(query(collection(db, "clientAssets"), where("clientId", "==", requestData.clientId)));
      const logoAssets = assetSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: typeof data.name === "string" ? data.name : "Logo sin nombre",
          type: typeof data.type === "string" ? data.type : "",
          category: typeof data.category === "string" ? data.category : "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          fileUrl: typeof data.fileUrl === "string" ? data.fileUrl : "",
          storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
          mimeType: typeof data.mimeType === "string" ? data.mimeType : "",
        } satisfies Asset;
      }).filter(isLogo);
      setLogos(logoAssets);
      setLogoId((cur) => logoAssets.some((logo) => logo.id === cur) ? cur : "");
    } catch (e) {
      console.error(e); setMsg("No pudimos cargar imágenes o logos del cliente.");
    } finally { setLoading(false); }
  }

  async function applyLogo() {
    const img = images.find((item) => item.id === imageId);
    const logo = logos.find((item) => item.id === logoId);
    if (!img) return setMsg("Selecciona una imagen.");
    if (!logo) return setMsg("Selecciona un logo de los assets del cliente o usa Quitar logo para volver a la imagen original.");
    setBusy(true); setMsg("");
    try {
      const baseImageUrl = img.logoOverlayApplied && img.originalImageUrl ? img.originalImageUrl : img.imageUrl;
      const logoOverlay = { enabled: true, fileUrl: logo.fileUrl, assetId: logo.id, assetName: logo.name, xPercent: x, yPercent: y, widthPercent: size };
      const res = await fetch("/api/apply-logo-overlay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: baseImageUrl, logoOverlay }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "No pudimos aplicar el logo.");
      const storagePath = `generated-images/${req?.clientId || "unknown-client"}/${requestId}/logo-overlay-${img.id}-${Date.now()}.png`;
      const storageRef = ref(storage, storagePath);
      await uploadString(storageRef, result.imageBase64, "base64", { contentType: "image/png" });
      const imageUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "generatedImages", img.id), {
        originalImageUrl: img.originalImageUrl || img.imageUrl,
        originalStoragePath: img.originalStoragePath || img.storagePath || "",
        imageUrl, storagePath,
        logoOverlayApplied: true,
        logoOverlayConfig: logoOverlay,
        logoOverlayAppliedBy: auth.currentUser?.uid ?? null,
        logoOverlayAppliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMsg("Logo aplicado correctamente.");
      await load();
    } catch (e) {
      console.error(e); setMsg(e instanceof Error ? e.message : "No pudimos aplicar el logo.");
    } finally { setBusy(false); }
  }

  async function removeLogo() {
    const img = images.find((item) => item.id === imageId);
    if (!img) return setMsg("Selecciona una imagen.");
    if (!img.originalImageUrl) return setMsg("Esta imagen no tiene versión original guardada.");
    setBusy(true); setMsg("");
    try {
      await updateDoc(doc(db, "generatedImages", img.id), {
        imageUrl: img.originalImageUrl,
        storagePath: img.originalStoragePath || "",
        logoOverlayApplied: false,
        logoOverlayConfig: null,
        logoOverlayAppliedBy: null,
        logoOverlayAppliedAt: null,
        updatedAt: serverTimestamp(),
      });
      setLogoId("");
      setMsg("Logo eliminado. La imagen regresó a su versión original.");
      await load();
    } catch (e) {
      console.error(e); setMsg(e instanceof Error ? e.message : "No pudimos quitar el logo.");
    } finally { setBusy(false); }
  }

  const selectedImage = images.find((item) => item.id === imageId);
  const selectedLogo = logos.find((item) => item.id === logoId);
  const canRestoreOriginal = Boolean(selectedImage?.logoOverlayApplied && selectedImage?.originalImageUrl);

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-24 right-6 z-[60] rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-zinc-800">🏷️ Editor de logo</button>
    {open ? <div className="fixed inset-0 z-[70] flex justify-end bg-zinc-950/30 backdrop-blur-sm">
      <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" />
      <aside className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="bg-zinc-950 px-6 py-5 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Editor de logo</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Editor simple de logo</h2><p className="mt-2 text-sm leading-6 text-zinc-300">Escoge logo, ajusta X/Y/tamaño, aplícalo o quítalo para regresar a la imagen original.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/10">Cerrar</button></div></header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{loading ? <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">Cargando editor...</p> : <div className="space-y-5">
          {images.length === 0 ? <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">Este request todavía no tiene imágenes generadas.</p> : null}
          {logos.length === 0 ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">Este cliente no tiene assets marcados como <strong>logo</strong>.</p> : null}
          {images.length > 0 ? <div><p className="mb-3 text-sm font-semibold text-zinc-900">1. Selecciona la imagen</p><div className="grid grid-cols-4 gap-3">{images.map((img) => <button key={img.id} type="button" onClick={() => setImageId(img.id)} className={`overflow-hidden rounded-2xl border bg-zinc-50 p-1 ${imageId === img.id ? "border-zinc-950" : "border-zinc-200"}`}><img src={img.imageUrl} alt="Imagen generada" className="aspect-square w-full rounded-xl object-cover" /></button>)}</div></div> : null}
          {logos.length > 0 ? <div><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-zinc-900">2. Selecciona el logo</p><button type="button" onClick={() => setLogoId("")} disabled={!logoId} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50">Sin logo</button></div><div className="grid grid-cols-3 gap-3">{logos.map((logo) => <button key={logo.id} type="button" onClick={() => setLogoId((currentLogoId) => currentLogoId === logo.id ? "" : logo.id)} className={`rounded-2xl border bg-white p-3 text-left transition ${logoId === logo.id ? "border-zinc-950" : "border-zinc-200 hover:bg-zinc-50"}`}><div className="flex h-16 items-center justify-center rounded-xl bg-zinc-50 p-2"><img src={logo.fileUrl} alt={logo.name} className="max-h-full max-w-full object-contain" /></div><p className="mt-2 line-clamp-2 text-xs font-semibold text-zinc-800">{logo.name}</p>{logoId === logo.id ? <p className="mt-1 text-[11px] font-semibold text-zinc-500">Click otra vez para desmarcar</p> : null}</button>)}</div></div> : null}
          {selectedImage && !selectedLogo ? <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">No hay logo seleccionado. Puedes guardar esta imagen sin logo o usar <span className="font-semibold text-zinc-900">Quitar logo</span> si la imagen seleccionada ya tenía uno aplicado.</div> : null}
          {selectedImage && selectedLogo ? <div className="grid gap-5 lg:grid-cols-[1fr_260px]"><div><p className="mb-3 text-sm font-semibold text-zinc-900">3. Ajusta sobre la imagen</p><div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100"><img src={selectedImage.imageUrl} alt="Imagen seleccionada" className="w-full select-none" /><img src={selectedLogo.fileUrl} alt="Logo preview" className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-md" style={{ left: `${x}%`, top: `${y}%`, width: `${size}%` }} /></div></div><div className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-sm font-semibold text-zinc-900">Plano X / Y / Size</p><label className="block text-sm font-medium text-zinc-800">X: {x}%<input type="range" min="0" max="100" value={x} onChange={(e) => setX(Number(e.target.value))} className="mt-2 w-full" /></label><label className="block text-sm font-medium text-zinc-800">Y: {y}%<input type="range" min="0" max="100" value={y} onChange={(e) => setY(Number(e.target.value))} className="mt-2 w-full" /></label><label className="block text-sm font-medium text-zinc-800">Tamaño: {size}%<input type="range" min="6" max="60" value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-2 w-full" /></label><div className="grid grid-cols-2 gap-2 pt-2"><button type="button" onClick={() => { setX(50); setY(88); setSize(20); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Inferior centro</button><button type="button" onClick={() => { setX(14); setY(10); setSize(18); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Arriba izq.</button><button type="button" onClick={() => { setX(86); setY(10); setSize(18); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Arriba der.</button><button type="button" onClick={() => { setX(86); setY(90); setSize(18); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100">Abajo der.</button></div></div></div> : null}
          {msg ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">{msg}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={applyLogo} disabled={busy || !selectedImage || !selectedLogo} className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70">{busy ? "Procesando..." : "🏷️ Aplicar logo"}</button>{canRestoreOriginal ? <button type="button" onClick={removeLogo} disabled={busy} className="flex h-12 w-full items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70">↩️ Quitar logo</button> : null}</div>
        </div>}</div>
      </aside>
    </div> : null}
  </>;
}

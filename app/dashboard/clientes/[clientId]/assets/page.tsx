"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";

type AssetRecord = {
  id: string;
  clientId: string;
  name: string;
  type: string;
  category: string;
  tags: string[];
  notes: string;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
  isFeatured: boolean;
};

type PendingAsset = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  type: string;
  category: string;
  tags: string;
  notes: string;
};

const assetTypes = [
  { id: "logo", label: "Logo" },
  { id: "reference", label: "Referencia" },
  { id: "product", label: "Producto" },
  { id: "element", label: "Elemento gráfico" },
  { id: "stock", label: "Stock aprobado" },
];

function isImageAsset(asset: AssetRecord) {
  if (asset.mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.storagePath);
}

function featuredLabel(type: string) {
  switch (type) {
    case "logo":
      return "Logo principal";
    case "reference":
      return "Referencia prioritaria";
    case "product":
      return "Producto principal";
    case "element":
      return "Elemento destacado";
    case "stock":
      return "Stock destacado";
    default:
      return "Destacado";
  }
}

function assetTypeLabel(type: string) {
  return assetTypes.find((assetType) => assetType.id === type)?.label ?? type;
}

function cleanFileName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function safeStorageFileName(fileName: string) {
  return fileName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function tagsToArray(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function createPendingAsset(file: File, index: number): PendingAsset {
  const id = `${Date.now()}-${index}-${file.name}`;
  const isImage = file.type.startsWith("image/");
  const fileName = cleanFileName(file.name);

  return {
    id,
    file,
    previewUrl: isImage ? URL.createObjectURL(file) : "",
    name: fileName || file.name,
    type: "reference",
    category: "",
    tags: "",
    notes: "",
  };
}

export default function ClientAssetsPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const clientId = params.clientId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);

  const [clientName, setClientName] = useState("Cliente");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
      await loadClientName();
      await loadAssets();
    });

    return () => unsubscribe();
  }, [clientId, router]);

  useEffect(() => {
    return () => {
      pendingAssets.forEach((asset) => {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
      });
    };
  }, [pendingAssets]);

  async function loadClientName() {
    try {
      const snapshot = await getDoc(doc(db, "clients", clientId));

      if (snapshot.exists()) {
        const data = snapshot.data();
        setClientName(typeof data.name === "string" ? data.name : "Cliente");
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAssets() {
    setIsLoadingAssets(true);
    setError("");

    try {
      const assetsQuery = query(
        collection(db, "clientAssets"),
        where("clientId", "==", clientId),
      );

      const snapshot = await getDocs(assetsQuery);

      const loadedAssets = snapshot.docs.map((assetDocument) => {
        const data = assetDocument.data();

        return {
          id: assetDocument.id,
          clientId: data.clientId ?? "",
          name: data.name ?? "Asset sin nombre",
          type: data.type ?? "",
          category: data.category ?? "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          notes: data.notes ?? "",
          fileUrl: data.fileUrl ?? "",
          storagePath: data.storagePath ?? "",
          mimeType: typeof data.mimeType === "string" ? data.mimeType : "",
          isFeatured: data.isFeatured === true,
        } as AssetRecord;
      });

      setAssets(loadedAssets);
    } catch (err) {
      console.error(err);
      setError("No pudimos cargar los assets.");
    } finally {
      setIsLoadingAssets(false);
    }
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setError("");
    setSuccess("");

    if (files.length === 0) return;

    setPendingAssets((currentAssets) => [
      ...currentAssets,
      ...files.map(createPendingAsset),
    ]);
    setFileInputKey((currentKey) => currentKey + 1);
  }

  function updatePendingAsset<K extends keyof Omit<PendingAsset, "id" | "file" | "previewUrl">>(
    assetId: string,
    field: K,
    value: PendingAsset[K],
  ) {
    setPendingAssets((currentAssets) =>
      currentAssets.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              [field]: value,
            }
          : asset,
      ),
    );
  }

  function removePendingAsset(assetId: string) {
    setPendingAssets((currentAssets) => {
      const assetToRemove = currentAssets.find((asset) => asset.id === assetId);
      if (assetToRemove?.previewUrl) URL.revokeObjectURL(assetToRemove.previewUrl);
      return currentAssets.filter((asset) => asset.id !== assetId);
    });
  }

  function clearPendingAssets() {
    pendingAssets.forEach((asset) => {
      if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
    });
    setPendingAssets([]);
    setFileInputKey((currentKey) => currentKey + 1);
  }

  async function handleUploadPendingAssets() {
    setError("");
    setSuccess("");

    if (pendingAssets.length === 0) {
      setError("Selecciona uno o varios archivos.");
      return;
    }

    const unnamedAsset = pendingAssets.find((asset) => !asset.name.trim());
    if (unnamedAsset) {
      setError("Todos los archivos deben tener nombre antes de subirlos.");
      return;
    }

    setIsUploading(true);

    try {
      for (const [index, asset] of pendingAssets.entries()) {
        const timestamp = Date.now();
        const safeFileName = safeStorageFileName(asset.file.name);
        const storagePath = `clients/${clientId}/${asset.type}/${timestamp}-${index + 1}-${safeFileName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, asset.file, {
          contentType: asset.file.type || undefined,
        });
        const fileUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, "clientAssets"), {
          clientId,
          clientName,
          name: asset.name.trim(),
          type: asset.type,
          category: asset.category.trim(),
          tags: tagsToArray(asset.tags),
          notes: asset.notes.trim(),
          fileUrl,
          storagePath,
          mimeType: asset.file.type,
          originalFileName: asset.file.name,
          isFeatured: false,
          createdBy: auth.currentUser?.uid ?? null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const uploadedCount = pendingAssets.length;
      clearPendingAssets();
      setSuccess(
        uploadedCount === 1
          ? "Asset subido correctamente."
          : `${uploadedCount} assets subidos correctamente.`,
      );
      await loadAssets();
    } catch (err) {
      console.error(err);
      setError("No pudimos subir los assets. Revisa Storage y Firestore.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleToggleFeatured(asset: AssetRecord) {
    setError("");
    setSuccess("");
    setBusyAssetId(asset.id);

    try {
      await updateDoc(doc(db, "clientAssets", asset.id), {
        isFeatured: !asset.isFeatured,
        updatedAt: serverTimestamp(),
      });

      setAssets((currentAssets) =>
        currentAssets.map((currentAsset) =>
          currentAsset.id === asset.id
            ? { ...currentAsset, isFeatured: !currentAsset.isFeatured }
            : currentAsset,
        ),
      );
      setSuccess(
        !asset.isFeatured
          ? `${featuredLabel(asset.type)} marcado.`
          : "Asset removido de destacados.",
      );
    } catch (err) {
      console.error(err);
      setError("No pudimos actualizar el estado destacado del asset.");
    } finally {
      setBusyAssetId(null);
    }
  }

  async function handleDeleteAsset(asset: AssetRecord) {
    const shouldDelete = window.confirm(
      `¿Eliminar "${asset.name}"? Esta acción quitará el archivo y su registro.`,
    );

    if (!shouldDelete) return;

    setError("");
    setSuccess("");
    setBusyAssetId(asset.id);

    try {
      if (asset.storagePath) {
        await deleteObject(ref(storage, asset.storagePath));
      }

      await deleteDoc(doc(db, "clientAssets", asset.id));
      setAssets((currentAssets) =>
        currentAssets.filter((currentAsset) => currentAsset.id !== asset.id),
      );
      setSuccess("Asset eliminado correctamente.");
    } catch (err) {
      console.error(err);
      setError("No pudimos eliminar el asset. Revisa Storage y Firestore.");
    } finally {
      setBusyAssetId(null);
    }
  }

  const groupedAssets = useMemo(() => {
    return assetTypes.map((assetType) => ({
      ...assetType,
      items: assets.filter((asset) => asset.type === assetType.id),
    }));
  }, [assets]);

  const featuredAssetsCount = useMemo(
    () => assets.filter((asset) => asset.isFeatured).length,
    [assets],
  );

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] px-6 py-5 text-sm text-zinc-200">
          Verificando sesión...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl shadow-zinc-300/60 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Link
                href={`/dashboard/clientes/${clientId}`}
                className="mb-5 inline-flex text-sm font-medium text-zinc-300 transition hover:text-white"
              >
                ← Volver al cliente
              </Link>

              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Assets
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {clientName}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Aquí se almacenan logos, referencias, producto y elementos visuales de la marca.
              </p>
            </div>

            <div className="grid min-w-64 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-medium text-zinc-300">Assets cargados</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
                  {assets.length}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-medium text-zinc-300">Destacados</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
                  {featuredAssetsCount}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Nuevo asset
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Subir uno o varios archivos
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Selecciona archivos, revísalos en la lista y llena nombre, tipo, categoría, tags y notas por cada uno antes de guardarlos.
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-5">
                <label className="block text-sm font-semibold text-zinc-900">Archivos</label>
                <input
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept="image/*,.svg,.pdf"
                  onChange={handleFilesChange}
                  className="mt-3 block w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
                />
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Puedes subir un solo archivo o seleccionar varios a la vez. Se agregarán a la lista antes de guardarse.
                </p>
              </div>

              {pendingAssets.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        Lista para cargar
                      </p>
                      <p className="text-xs text-zinc-500">
                        {pendingAssets.length} {pendingAssets.length === 1 ? "archivo pendiente" : "archivos pendientes"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearPendingAssets}
                      disabled={isUploading}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Limpiar lista
                    </button>
                  </div>

                  {pendingAssets.map((asset, index) => (
                    <div key={asset.id} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950">
                            {index + 1}. {asset.file.name}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {asset.file.type || "Tipo no detectado"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePendingAsset(asset.id)}
                          disabled={isUploading}
                          className="inline-flex h-9 items-center justify-center rounded-2xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Quitar
                        </button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[104px_1fr]">
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          {asset.previewUrl ? (
                            <img
                              src={asset.previewUrl}
                              alt={asset.name || asset.file.name}
                              className="h-24 w-full object-contain p-2"
                            />
                          ) : (
                            <div className="flex h-24 items-center justify-center px-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Archivo
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-800">Nombre</label>
                            <input
                              value={asset.name}
                              onChange={(event) => updatePendingAsset(asset.id, "name", event.target.value)}
                              placeholder="Ej. Logo principal azul"
                              className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-800">Tipo</label>
                            <select
                              value={asset.type}
                              onChange={(event) => updatePendingAsset(asset.id, "type", event.target.value)}
                              className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                            >
                              {assetTypes.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-800">Categoría</label>
                            <input
                              value={asset.category}
                              onChange={(event) => updatePendingAsset(asset.id, "category", event.target.value)}
                              placeholder="Ej. primary, white, packshot"
                              className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-800">Tags</label>
                            <input
                              value={asset.tags}
                              onChange={(event) => updatePendingAsset(asset.id, "tags", event.target.value)}
                              placeholder="logo, azul, principal"
                              className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                            />
                          </div>

                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-zinc-800">Notas</label>
                            <textarea
                              value={asset.notes}
                              onChange={(event) => updatePendingAsset(asset.id, "notes", event.target.value)}
                              placeholder="Ej. Usar solo sobre fondo blanco."
                              className="min-h-20 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-zinc-950"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleUploadPendingAssets}
                disabled={isUploading || pendingAssets.length === 0}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isUploading
                  ? "Subiendo..."
                  : pendingAssets.length <= 1
                    ? "Subir asset"
                    : `Subir ${pendingAssets.length} assets`}
              </button>
            </div>
          </article>

          <article className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Biblioteca visual
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Assets almacenados
              </h2>
            </div>

            {isLoadingAssets ? (
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-6 text-sm text-zinc-600">
                Cargando assets...
              </div>
            ) : assets.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm leading-6 text-zinc-600">
                Todavía no hay assets cargados para este cliente.
              </div>
            ) : (
              <div className="space-y-6">
                {groupedAssets.map((group) =>
                  group.items.length > 0 ? (
                    <div key={group.id} className="space-y-3">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <h3 className="text-lg font-semibold tracking-tight">
                          {group.label}
                        </h3>
                        <span className="text-sm text-zinc-500">
                          {group.items.length} {group.items.length === 1 ? "archivo" : "archivos"}
                        </span>
                      </div>

                      <div className="grid gap-4">
                        {group.items.map((asset) => (
                          <div
                            key={asset.id}
                            className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4"
                          >
                            <div className="grid gap-4 md:grid-cols-[130px_1fr]">
                              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                                {isImageAsset(asset) ? (
                                  <img
                                    src={asset.fileUrl}
                                    alt={asset.name}
                                    className="h-32 w-full object-contain p-3"
                                  />
                                ) : (
                                  <div className="flex h-32 items-center justify-center px-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                    Archivo
                                  </div>
                                )}
                              </div>

                              <div className="flex min-w-0 flex-col justify-between gap-4">
                                <div>
                                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-base font-semibold text-zinc-950">
                                          {asset.name}
                                        </p>
                                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-700">
                                          {assetTypeLabel(asset.type)}
                                        </span>
                                        {asset.isFeatured ? (
                                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                                            {featuredLabel(asset.type)}
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-1 text-sm text-zinc-600">
                                        {asset.category || "Sin categoría"}
                                      </p>
                                    </div>
                                  </div>

                                  {asset.tags.length > 0 ? (
                                    <p className="mt-2 text-xs text-zinc-500">
                                      Tags: {asset.tags.join(", ")}
                                    </p>
                                  ) : null}
                                  {asset.notes ? (
                                    <p className="mt-2 text-sm text-zinc-600">
                                      {asset.notes}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                  <a
                                    href={asset.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-10 items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                                  >
                                    Ver archivo
                                  </a>
                                  <button
                                    type="button"
                                    disabled={busyAssetId === asset.id}
                                    onClick={() => handleToggleFeatured(asset)}
                                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {asset.isFeatured ? "Quitar destacado" : "Marcar destacado"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyAssetId === asset.id}
                                    onClick={() => handleDeleteAsset(asset)}
                                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState("logo");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

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
        where("clientId", "==", clientId)
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedFile) {
      setError("Selecciona un archivo.");
      return;
    }

    if (!name.trim()) {
      setError("Escribe un nombre para el asset.");
      return;
    }

    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const safeFileName = selectedFile.name.replace(/\s+/g, "-");
      const storagePath = `clients/${clientId}/${type}/${timestamp}-${safeFileName}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, selectedFile);
      const fileUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "clientAssets"), {
        clientId,
        name: name.trim(),
        type,
        category: category.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: notes.trim(),
        fileUrl,
        storagePath,
        mimeType: selectedFile.type,
        isFeatured: false,
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setName("");
      setType("logo");
      setCategory("");
      setTags("");
      setNotes("");
      setSelectedFile(null);
      setFileInputKey((currentKey) => currentKey + 1);
      setSuccess("Asset subido correctamente.");

      await loadAssets();
    } catch (err) {
      console.error(err);
      setError("No pudimos subir el asset. Revisa Storage y Firestore.");
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
            : currentAsset
        )
      );
      setSuccess(
        !asset.isFeatured
          ? `${featuredLabel(asset.type)} marcado.`
          : "Asset removido de destacados."
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
      `¿Eliminar \"${asset.name}\"? Esta acción quitará el archivo y su registro.`
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
        currentAssets.filter((currentAsset) => currentAsset.id !== asset.id)
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
    [assets]
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

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Nuevo asset
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Subir archivo
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Usa esta biblioteca para dejar listo lo que la IA deberá consultar por cliente.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800">Nombre</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Logo principal azul"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  required
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
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
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ej. primary, white, campaign, packshot"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800">Tags</label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="logo, azul, principal"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
                <p className="text-xs leading-5 text-zinc-500">Separados por coma.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800">Notas</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Usar solo sobre fondo blanco."
                  className="min-h-28 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800">Archivo</label>
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/*,.svg,.pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-zinc-700"
                />
                {selectedFile ? (
                  <p className="text-xs leading-5 text-zinc-500">
                    Seleccionado: {selectedFile.name}
                  </p>
                ) : null}
              </div>

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
                type="submit"
                disabled={isUploading}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isUploading ? "Subiendo..." : "Subir asset"}
              </button>
            </form>
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
                  ) : null
                )}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

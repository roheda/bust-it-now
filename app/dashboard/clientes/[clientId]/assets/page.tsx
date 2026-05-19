"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
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
};

const assetTypes = [
  { id: "logo", label: "Logo" },
  { id: "reference", label: "Referencia" },
  { id: "product", label: "Producto" },
  { id: "element", label: "Elemento gráfico" },
  { id: "stock", label: "Stock aprobado" },
];

export default function ClientAssetsPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const clientId = params.clientId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

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
      const snapshot = await getDocs(
        query(collection(db, "clients"), where("__name__", "==", clientId))
      );

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
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
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(assetsQuery);

      const loadedAssets = snapshot.docs.map((doc) => {
        const data = doc.data();

        return {
          id: doc.id,
          clientId: data.clientId ?? "",
          name: data.name ?? "Asset sin nombre",
          type: data.type ?? "",
          category: data.category ?? "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          notes: data.notes ?? "",
          fileUrl: data.fileUrl ?? "",
          storagePath: data.storagePath ?? "",
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
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
      });

      setName("");
      setType("logo");
      setCategory("");
      setTags("");
      setNotes("");
      setSelectedFile(null);
      setSuccess("Asset subido correctamente.");

      await loadAssets();
    } catch (err) {
      console.error(err);
      setError("No pudimos subir el asset. Revisa Storage y Firestore.");
    } finally {
      setIsUploading(false);
    }
  }

  const groupedAssets = useMemo(() => {
    return assetTypes.map((assetType) => ({
      ...assetType,
      items: assets.filter((asset) => asset.type === assetType.id),
    }));
  }, [assets]);

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
                  type="file"
                  accept="image/*,.svg,.pdf"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-zinc-700"
                />
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
                      <h3 className="text-lg font-semibold tracking-tight">
                        {group.label}
                      </h3>

                      <div className="grid gap-4">
                        {group.items.map((asset) => (
                          <div
                            key={asset.id}
                            className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-base font-semibold text-zinc-950">
                                  {asset.name}
                                </p>
                                <p className="mt-1 text-sm text-zinc-600">
                                  {asset.category || "Sin categoría"}
                                </p>
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

                              <a
                                href={asset.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-10 items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                              >
                                Ver archivo
                              </a>
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
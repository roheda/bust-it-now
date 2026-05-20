"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

type ClientRecord = {
  id: string;
  name: string;
  industry: string;
};

type BrandBrain = {
  brandDescription?: string;
  tone?: string;
  colors?: string[];
  typography?: string;
  visualStyle?: string[];
  dos?: string[];
  donts?: string[];
  recommendedModels?: string[];
};

type AssetRecord = {
  id: string;
  name: string;
  type: string;
  category: string;
  tags: string[];
  notes: string;
  fileUrl: string;
  storagePath?: string;
  mimeType?: string;
  isFeatured: boolean;
};

type RequestAttachmentRecord = {
  name: string;
  role: string;
  notes: string;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
};

type GenerationRequestSummary = {
  id: string;
  clientName: string;
  mainMessage: string;
  status: string;
  format: string;
  contentType: string;
};

const formats = [
  { id: "instagram-post", label: "Post Instagram 4:5" },
  { id: "instagram-story", label: "Story 9:16" },
  { id: "square-post", label: "Cuadrado 1:1" },
  { id: "reel-cover", label: "Portada de Reel" },
  { id: "ad-creative", label: "Creativo para pauta" },
];

const goals = [
  { id: "sell", label: "Vender" },
  { id: "inform", label: "Informar" },
  { id: "announce", label: "Anunciar" },
  { id: "position", label: "Posicionar marca" },
  { id: "interaction", label: "Generar interacción" },
  { id: "trust", label: "Dar confianza" },
];

const contentTypes = [
  { id: "promotion", label: "Promoción" },
  { id: "product", label: "Producto o servicio" },
  { id: "event", label: "Evento" },
  { id: "notice", label: "Aviso" },
  { id: "seasonal", label: "Fecha especial" },
  { id: "branding", label: "Contenido de marca" },
];

const emotions = [
  "Premium",
  "Urgente",
  "Elegante",
  "Comercial",
  "Tecnológico",
  "Cercano",
  "Apetitoso",
  "Familiar",
  "Sofisticado",
  "Divertido",
];

const visualElements = [
  "Producto",
  "Persona",
  "Ambiente",
  "Local o espacio",
  "Logo visible",
  "Precio",
  "Fecha",
  "CTA",
  "Fondo limpio",
  "Textura o patrón de marca",
];

const supportedModels = [
  {
    id: "draft-mini-low",
    label: "Borrador económico · GPT Image Mini",
  },
  {
    id: "nano-banana",
    label: "Calidad para redes · Nano Banana",
  },
  {
    id: "gpt-image",
    label: "GPT Image estándar",
  },
];

const requestAttachmentRoles = [
  { id: "producto-principal", label: "Producto principal" },
  { id: "platillo-principal", label: "Platillo principal" },
  { id: "referencia-visual", label: "Referencia visual" },
  { id: "fondo-ambiente", label: "Fondo / ambiente" },
  { id: "promocion", label: "Promoción" },
];

function mapModelLabel(modelId: string) {
  return supportedModels.find((model) => model.id === modelId)?.label ?? modelId;
}

function formatStatus(status: string) {
  switch (status) {
    case "completed":
      return "Generado";
    case "generating":
      return "Generando";
    case "error":
      return "Error";
    case "saving_assets":
      return "Guardando";
    case "brief_ready":
    default:
      return "Brief listo";
  }
}

function isImageAsset(asset: AssetRecord) {
  const mimeType = asset.mimeType || "";
  const path = `${asset.fileUrl} ${asset.storagePath || ""}`.toLowerCase();

  return (
    mimeType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(path) ||
    path.includes("firebasestorage.googleapis.com")
  );
}

function toggleArrayValue(value: string, currentValues: string[]) {
  return currentValues.includes(value)
    ? currentValues.filter((currentValue) => currentValue !== value)
    : [...currentValues, value];
}

function safeFileName(fileName: string) {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "request-attachment";
}

export default function GeneratorPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isLoadingRecentRequests, setIsLoadingRecentRequests] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [recentRequests, setRecentRequests] = useState<GenerationRequestSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [brandBrain, setBrandBrain] = useState<BrandBrain | null>(null);
  const [clientAssets, setClientAssets] = useState<AssetRecord[]>([]);

  const [format, setFormat] = useState("instagram-post");
  const [goal, setGoal] = useState("sell");
  const [contentType, setContentType] = useState("promotion");
  const [mainMessage, setMainMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [cta, setCta] = useState("");
  const [priceOrOffer, setPriceOrOffer] = useState("");
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [selectedVisualElements, setSelectedVisualElements] = useState<string[]>([]);
  const [specificInstructions, setSpecificInstructions] = useState("");
  const [selectedModel, setSelectedModel] = useState("draft-mini-low");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const [requestImageFile, setRequestImageFile] = useState<File | null>(null);
  const [requestImagePreview, setRequestImagePreview] = useState("");
  const [requestImageName, setRequestImageName] = useState("");
  const [requestImageRole, setRequestImageRole] = useState("producto-principal");
  const [requestImageNotes, setRequestImageNotes] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
      setIsCheckingSession(false);
      await Promise.all([loadClients(), loadRecentRequests()]);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    return () => {
      if (requestImagePreview) {
        URL.revokeObjectURL(requestImagePreview);
      }
    };
  }, [requestImagePreview]);

  async function loadClients() {
    setIsLoadingClients(true);
    setError("");

    try {
      const snapshot = await getDocs(query(collection(db, "clients")));
      const loadedClients = snapshot.docs.map((clientDocument) => {
        const data = clientDocument.data();

        return {
          id: clientDocument.id,
          name: typeof data.name === "string" ? data.name : "Cliente sin nombre",
          industry: typeof data.industry === "string" ? data.industry : "",
        } satisfies ClientRecord;
      });

      loadedClients.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setClients(loadedClients);
    } catch (loadError) {
      console.error(loadError);
      setError("No pudimos cargar clientes para el generador.");
    } finally {
      setIsLoadingClients(false);
    }
  }

  async function loadRecentRequests() {
    setIsLoadingRecentRequests(true);

    try {
      const snapshot = await getDocs(query(collection(db, "generationRequests")));
      const loadedRequests = snapshot.docs.map((requestDocument) => {
        const data = requestDocument.data();

        return {
          id: requestDocument.id,
          clientName: typeof data.clientName === "string" ? data.clientName : "Cliente",
          mainMessage: typeof data.mainMessage === "string" ? data.mainMessage : "Sin mensaje",
          status: typeof data.status === "string" ? data.status : "brief_ready",
          format: typeof data.format === "string" ? data.format : "",
          contentType: typeof data.contentType === "string" ? data.contentType : "",
        } satisfies GenerationRequestSummary;
      });

      setRecentRequests(loadedRequests.slice(-8).reverse());
    } catch (loadError) {
      console.error(loadError);
    } finally {
      setIsLoadingRecentRequests(false);
    }
  }

  async function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedClient(null);
    setBrandBrain(null);
    setClientAssets([]);
    setSelectedAssetIds([]);
    setError("");

    if (!clientId) return;

    setIsLoadingContext(true);

    try {
      const clientSnapshot = await getDoc(doc(db, "clients", clientId));

      if (!clientSnapshot.exists()) {
        setError("No encontramos el cliente seleccionado.");
        return;
      }

      const clientData = clientSnapshot.data();
      const loadedClient = {
        id: clientSnapshot.id,
        name: typeof clientData.name === "string" ? clientData.name : "Cliente sin nombre",
        industry: typeof clientData.industry === "string" ? clientData.industry : "",
      } satisfies ClientRecord;

      setSelectedClient(loadedClient);
      setBrandBrain((clientData.brandBrain as BrandBrain | undefined) ?? null);

      const assetsSnapshot = await getDocs(
        query(collection(db, "clientAssets"), where("clientId", "==", clientId)),
      );

      const loadedAssets = assetsSnapshot.docs.map((assetDocument) => {
        const data = assetDocument.data();

        return {
          id: assetDocument.id,
          name: typeof data.name === "string" ? data.name : "Asset sin nombre",
          type: typeof data.type === "string" ? data.type : "",
          category: typeof data.category === "string" ? data.category : "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          notes: typeof data.notes === "string" ? data.notes : "",
          fileUrl: typeof data.fileUrl === "string" ? data.fileUrl : "",
          storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
          mimeType: typeof data.mimeType === "string" ? data.mimeType : "",
          isFeatured: data.isFeatured === true,
        } satisfies AssetRecord;
      });

      loadedAssets.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
      setClientAssets(loadedAssets);

      const featuredAssetIds = loadedAssets
        .filter((asset) => asset.isFeatured)
        .map((asset) => asset.id);
      setSelectedAssetIds(featuredAssetIds);

      const preferredModels = Array.isArray(clientData.brandBrain?.recommendedModels)
        ? clientData.brandBrain.recommendedModels
        : [];

      setSelectedModel(preferredModels[0] || "draft-mini-low");
    } catch (contextError) {
      console.error(contextError);
      setError("No pudimos cargar el Brand Brain y los assets del cliente.");
    } finally {
      setIsLoadingContext(false);
    }
  }

  function handleRequestImageChange(file: File | null) {
    setRequestImageFile(file);

    if (requestImagePreview) {
      URL.revokeObjectURL(requestImagePreview);
    }

    if (!file) {
      setRequestImagePreview("");
      setRequestImageName("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("La referencia puntual debe ser una imagen PNG, JPG o WEBP.");
      setRequestImageFile(null);
      setRequestImagePreview("");
      return;
    }

    setError("");
    setRequestImagePreview(URL.createObjectURL(file));

    if (!requestImageName.trim()) {
      setRequestImageName(file.name);
    }
  }

  function clearRequestImage() {
    if (requestImagePreview) {
      URL.revokeObjectURL(requestImagePreview);
    }

    setRequestImageFile(null);
    setRequestImagePreview("");
    setRequestImageName("");
    setRequestImageRole("producto-principal");
    setRequestImageNotes("");
  }

  async function handleSaveBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedClientId || !selectedClient) {
      setError("Selecciona un cliente.");
      return;
    }

    if (!mainMessage.trim()) {
      setError("Escribe el mensaje principal de la pieza.");
      return;
    }

    setIsSaving(true);

    try {
      const selectedAssetsSnapshot = clientAssets.filter((asset) =>
        selectedAssetIds.includes(asset.id),
      );

      const requestRef = await addDoc(collection(db, "generationRequests"), {
        clientId: selectedClientId,
        clientName: selectedClient.name,
        clientIndustry: selectedClient.industry,
        format,
        goal,
        contentType,
        mainMessage: mainMessage.trim(),
        copy: {
          headline: headline.trim(),
          subheadline: subheadline.trim(),
          cta: cta.trim(),
          priceOrOffer: priceOrOffer.trim(),
        },
        selectedEmotions,
        selectedVisualElements,
        specificInstructions: specificInstructions.trim(),
        selectedModel,
        selectedModelLabel: mapModelLabel(selectedModel),
        brandBrainSnapshot: brandBrain ?? {},
        selectedAssetIds,
        selectedAssetsSnapshot,
        requestAttachments: [],
        status: requestImageFile ? "saving_assets" : "brief_ready",
        createdBy: user?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const requestAttachments: RequestAttachmentRecord[] = [];

      if (requestImageFile) {
        const storagePath = `generation-attachments/${selectedClientId}/${requestRef.id}/${Date.now()}-${safeFileName(requestImageFile.name)}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, requestImageFile, {
          contentType: requestImageFile.type,
        });

        const fileUrl = await getDownloadURL(storageRef);

        requestAttachments.push({
          name: requestImageName.trim() || requestImageFile.name,
          role: requestImageRole,
          notes: requestImageNotes.trim(),
          fileUrl,
          storagePath,
          mimeType: requestImageFile.type,
        });
      }

      if (requestImageFile) {
        await updateDoc(requestRef, {
          requestAttachments,
          status: "brief_ready",
          updatedAt: serverTimestamp(),
        });
      }

      router.push(`/dashboard/generador/${requestRef.id}`);
    } catch (saveError) {
      console.error(saveError);
      setError("No pudimos guardar el brief de generación ni la referencia puntual.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedModelLabel = useMemo(() => mapModelLabel(selectedModel), [selectedModel]);
  const recommendedModels = brandBrain?.recommendedModels ?? [];
  const selectedAssets = clientAssets.filter((asset) => selectedAssetIds.includes(asset.id));
  const selectedImageAssetsCount = selectedAssets.filter(isImageAsset).length;

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
          <Link href="/dashboard" className="mb-5 inline-flex text-sm font-medium text-zinc-300 transition hover:text-white">
            ← Volver al dashboard
          </Link>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
            BUST IT NOW
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Generador de piezas
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Selecciona una marca, carga su Brand Brain, elige los assets que sí deben viajar al request y suma una referencia puntual para la pieza cuando haga falta.
          </p>
        </header>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Historial</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Briefs recientes</h2>
            </div>
            <button
              type="button"
              onClick={loadRecentRequests}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
            >
              Actualizar historial
            </button>
          </div>

          {isLoadingRecentRequests ? (
            <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-5 text-sm text-zinc-600">Cargando briefs recientes...</div>
          ) : recentRequests.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-center text-sm text-zinc-600">Todavía no hay briefs guardados.</div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {recentRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/dashboard/generador/${request.id}`}
                  className="group rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:shadow-lg hover:shadow-zinc-200/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">{request.clientName}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-600">{request.mainMessage}</p>
                    </div>
                    <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                      {formatStatus(request.status)}
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-medium text-zinc-500">{request.format || "Formato"} · {request.contentType || "Contenido"}</p>
                  <p className="mt-3 text-sm font-semibold text-zinc-950 transition group-hover:translate-x-1">Abrir →</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <form className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]" onSubmit={handleSaveBrief}>
          <section className="space-y-6 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">1. Selecciona la marca</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Contexto automático del cliente</h2>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-800" htmlFor="client-select">Cliente</label>
              <select
                id="client-select"
                value={selectedClientId}
                onChange={(event) => handleClientChange(event.target.value)}
                className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
              >
                <option value="">Selecciona un cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
              {isLoadingClients ? <p className="text-xs text-zinc-500">Cargando clientes...</p> : null}
            </div>

            {isLoadingContext ? (
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">Leyendo Brand Brain y assets del cliente...</div>
            ) : null}

            {selectedClient ? (
              <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-5 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Cliente</p>
                  <p className="mt-2 text-lg font-semibold text-zinc-950">{selectedClient.name}</p>
                  <p className="mt-1 text-sm text-zinc-600">{selectedClient.industry || "Sin categoría"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Motor sugerido</p>
                  <p className="mt-2 text-lg font-semibold text-zinc-950">{selectedModelLabel}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {recommendedModels.length > 0 ? `Basado en ${recommendedModels.map(mapModelLabel).join(", ")}` : "Sin preferencia definida en Brand Brain"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">2. Define la pieza</p>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <SelectField label="Formato" value={format} onChange={setFormat} options={formats} />
                <SelectField label="Objetivo" value={goal} onChange={setGoal} options={goals} />
                <SelectField label="Tipo de contenido" value={contentType} onChange={setContentType} options={contentTypes} />
              </div>
            </div>

            <div className="space-y-5 border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">3. Mensaje de la publicación</p>
              <TextAreaField
                label="Qué debe entender la persona en 3 segundos"
                value={mainMessage}
                onChange={setMainMessage}
                placeholder="Ej. Promo de lanzamiento con 20% de descuento en todos los paquetes de servicio."
                required
              />
              <div className="grid gap-5 md:grid-cols-2">
                <InputField label="Titular dentro de la imagen" value={headline} onChange={setHeadline} placeholder="Ej. Llega tu nueva promo" />
                <InputField label="Subtítulo" value={subheadline} onChange={setSubheadline} placeholder="Ej. Disponible del 10 al 20 de junio" />
                <InputField label="Precio o promoción" value={priceOrOffer} onChange={setPriceOrOffer} placeholder="Ej. $2,100 envío incluido" />
                <InputField label="CTA" value={cta} onChange={setCta} placeholder="Ej. Pide por WhatsApp" />
              </div>
            </div>

            <section className="space-y-5 border-t border-zinc-200 pt-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">4. Referencia específica de esta pieza</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Sube aquí un producto, platillo o imagen puntual que deba considerarse solo para este brief. Viaja como referencia prioritaria al generador.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="request-image">
                  Imagen puntual
                </label>
                <input
                  id="request-image"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(event) => handleRequestImageChange(event.target.files?.[0] || null)}
                  className="block w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
                />
              </div>

              {requestImagePreview ? (
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2">
                      <img
                        src={requestImagePreview}
                        alt="Vista previa de referencia puntual"
                        className="max-h-52 max-w-full rounded-xl object-contain"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={clearRequestImage}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                    >
                      Quitar imagen
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-5 md:grid-cols-2">
                <InputField
                  label="Nombre del archivo"
                  value={requestImageName}
                  onChange={setRequestImageName}
                  placeholder="Ej. Hamburguesa doble"
                />
                <SelectField
                  label="Rol de la imagen"
                  value={requestImageRole}
                  onChange={setRequestImageRole}
                  options={requestAttachmentRoles}
                />
              </div>

              <TextAreaField
                label="Instrucción sobre este archivo"
                value={requestImageNotes}
                onChange={setRequestImageNotes}
                placeholder="Ej. usar este producto como protagonista, respetar su forma y hacerlo el elemento principal del diseño."
              />
            </section>

            <div className="space-y-5 border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">5. Dirección visual</p>
              <ChipSelector label="Qué debe transmitir" values={emotions} selectedValues={selectedEmotions} onToggle={(value) => setSelectedEmotions(toggleArrayValue(value, selectedEmotions))} />
              <ChipSelector label="Elementos que deben aparecer" values={visualElements} selectedValues={selectedVisualElements} onToggle={(value) => setSelectedVisualElements(toggleArrayValue(value, selectedVisualElements))} />
              <TextAreaField
                label="Instrucciones puntuales"
                value={specificInstructions}
                onChange={setSpecificInstructions}
                placeholder="Ej. No mover el producto, que la imagen se sienta limpia y de alto valor, evitar exceso de texto."
              />
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Contexto leído</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Brand Brain</h2>
              {!selectedClient ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">Selecciona un cliente para ver la información que alimentará el prompt.</p>
              ) : (
                <div className="mt-5 space-y-4 text-sm leading-6 text-zinc-600">
                  <SummaryItem label="Descripción" value={brandBrain?.brandDescription || "Sin descripción todavía."} />
                  <SummaryItem label="Tono" value={brandBrain?.tone || "Sin tono definido."} />
                  <SummaryItem label="Estilo visual" value={brandBrain?.visualStyle?.join(", ") || "Sin estilo definido."} />
                  <SummaryItem label="Colores" value={brandBrain?.colors?.join(", ") || "Sin colores registrados."} />
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Assets del cliente</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Elegir para este brief</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Los destacados se preseleccionan, pero puedes agregar o quitar cualquier asset.
              </p>

              {!selectedClient ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">Selecciona un cliente para ver sus assets.</p>
              ) : clientAssets.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">Este cliente aún no tiene assets cargados.</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {clientAssets.map((asset) => {
                    const selected = selectedAssetIds.includes(asset.id);
                    const imageAsset = isImageAsset(asset);

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => setSelectedAssetIds(toggleArrayValue(asset.id, selectedAssetIds))}
                        className={`rounded-3xl border p-4 text-left transition ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-white"}`}
                      >
                        <div className="grid grid-cols-[56px_1fr] items-center gap-3">
                          <div className={`overflow-hidden rounded-2xl border ${selected ? "border-white/20 bg-white/10" : "border-zinc-200 bg-white"}`}>
                            {imageAsset ? (
                              <img src={asset.fileUrl} alt={asset.name} className="h-14 w-full object-contain p-2" />
                            ) : (
                              <div className="flex h-14 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.12em]">File</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{asset.name}</p>
                              {asset.isFeatured ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${selected ? "bg-white text-zinc-950" : "bg-amber-100 text-amber-800"}`}>
                                  Destacado
                                </span>
                              ) : null}
                            </div>
                            <p className={`mt-1 text-xs ${selected ? "text-zinc-300" : "text-zinc-500"}`}>
                              {asset.type || "asset"} {asset.category ? `· ${asset.category}` : ""}
                              {imageAsset ? " · imagen usable" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"}`}>
                            {selected ? "Usar" : "Omitir"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedClient ? (
                <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                  <p><span className="font-semibold text-zinc-950">{selectedAssetIds.length}</span> asset(s) seleccionados.</p>
                  <p><span className="font-semibold text-zinc-950">{selectedImageAssetsCount}</span> asset(s) de imagen podrán usarse como referencias visuales reales.</p>
                  <p><span className="font-semibold text-zinc-950">{requestImageFile ? 1 : 0}</span> referencia puntual será priorizada en este request.</p>
                </div>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Motor de IA</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Selección del generador</h2>
              <div className="mt-5">
                <SelectField label="Modelo" value={selectedModel} onChange={setSelectedModel} options={supportedModels} />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">Selección actual: <span className="font-semibold text-zinc-950">{selectedModelLabel}</span></p>
            </section>

            {error ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={isSaving}
              className="flex h-14 w-full items-center justify-center rounded-3xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Guardando brief..." : "Guardar brief de generación"}
            </button>
          </aside>
        </form>
      </div>
    </main>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-800">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-800">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-800">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="min-h-28 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
      />
    </div>
  );
}

function ChipSelector({
  label,
  values,
  selectedValues,
  onToggle,
}: {
  label: string;
  values: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium text-zinc-800">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const selected = selectedValues.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-zinc-900">{label}</p>
      <p>{value}</p>
    </div>
  );
}

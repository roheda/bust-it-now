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
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

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
  isFeatured: boolean;
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
  { id: "auto", label: "Automático recomendado" },
  { id: "nano-banana", label: "Nano Banana" },
  { id: "gpt-image", label: "GPT Image" },
  { id: "firefly", label: "Adobe Firefly" },
  { id: "ideogram", label: "Ideogram" },
  { id: "flux", label: "Flux" },
];

function mapModelLabel(modelId: string) {
  return supportedModels.find((model) => model.id === modelId)?.label ?? modelId;
}

export default function GeneratorPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [brandBrain, setBrandBrain] = useState<BrandBrain | null>(null);
  const [featuredAssets, setFeaturedAssets] = useState<AssetRecord[]>([]);

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
  const [selectedModel, setSelectedModel] = useState("auto");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
      setIsCheckingSession(false);
      await loadClients();
    });

    return () => unsubscribe();
  }, [router]);

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

  async function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedClient(null);
    setBrandBrain(null);
    setFeaturedAssets([]);
    setSelectedAssetIds([]);
    setSuccess("");
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
        query(
          collection(db, "clientAssets"),
          where("clientId", "==", clientId),
          where("isFeatured", "==", true),
        ),
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
          isFeatured: data.isFeatured === true,
        } satisfies AssetRecord;
      });

      setFeaturedAssets(loadedAssets);
      setSelectedAssetIds(loadedAssets.map((asset) => asset.id));

      const preferredModels = Array.isArray(clientData.brandBrain?.recommendedModels)
        ? clientData.brandBrain.recommendedModels
        : [];

      if (preferredModels.length > 0) {
        setSelectedModel(preferredModels[0]);
      } else {
        setSelectedModel("auto");
      }
    } catch (contextError) {
      console.error(contextError);
      setError("No pudimos cargar el Brand Brain y assets destacados del cliente.");
    } finally {
      setIsLoadingContext(false);
    }
  }

  function toggleSelection(value: string, selectedValues: string[], setter: (values: string[]) => void) {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((selectedValue) => selectedValue !== value)
        : [...selectedValues, value],
    );
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((currentIds) =>
      currentIds.includes(assetId)
        ? currentIds.filter((currentId) => currentId !== assetId)
        : [...currentIds, assetId],
    );
  }

  async function handleSaveBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

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
      await addDoc(collection(db, "generationRequests"), {
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
        selectedAssetsSnapshot: featuredAssets.filter((asset) => selectedAssetIds.includes(asset.id)),
        status: "brief_ready",
        createdBy: user?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccess("Brief guardado correctamente. Ya está listo para conectarse con el generador de imágenes.");
    } catch (saveError) {
      console.error(saveError);
      setError("No pudimos guardar el brief de generación.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedModelLabel = useMemo(() => mapModelLabel(selectedModel), [selectedModel]);
  const recommendedModels = brandBrain?.recommendedModels ?? [];

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
            href="/dashboard"
            className="mb-5 inline-flex text-sm font-medium text-zinc-300 transition hover:text-white"
          >
            ← Volver al dashboard
          </Link>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
            BUST IT NOW
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Generador de piezas
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Selecciona una marca, deja que el sistema lea su Brand Brain y prepara el brief visual que luego enviaremos a Nano Banana, GPT Image u otro modelo.
          </p>
        </header>

        <form className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]" onSubmit={handleSaveBrief}>
          <section className="space-y-6 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                1. Selecciona la marca
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Contexto automático del cliente
              </h2>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-800" htmlFor="client-select">
                Cliente
              </label>
              <select
                id="client-select"
                value={selectedClientId}
                onChange={(event) => handleClientChange(event.target.value)}
                className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
              >
                <option value="">Selecciona un cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {isLoadingClients ? (
                <p className="text-xs text-zinc-500">Cargando clientes...</p>
              ) : null}
            </div>

            {isLoadingContext ? (
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">
                Leyendo Brand Brain y assets destacados...
              </div>
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
                    {recommendedModels.length > 0
                      ? `Basado en ${recommendedModels.map(mapModelLabel).join(", ")}`
                      : "Sin preferencia definida en Brand Brain"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                2. Define la pieza
              </p>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Formato</label>
                  <select
                    value={format}
                    onChange={(event) => setFormat(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  >
                    {formats.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Objetivo</label>
                  <select
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  >
                    {goals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Tipo de contenido</label>
                  <select
                    value={contentType}
                    onChange={(event) => setContentType(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  >
                    {contentTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-5 border-t border-zinc-200 pt-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  3. Mensaje de la publicación
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="main-message">
                  Qué debe entender la persona en 3 segundos
                </label>
                <textarea
                  id="main-message"
                  value={mainMessage}
                  onChange={(event) => setMainMessage(event.target.value)}
                  placeholder="Ej. Promo de lanzamiento con 20% de descuento en todos los paquetes de servicio."
                  className="min-h-28 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  required
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Titular dentro de la imagen</label>
                  <input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    placeholder="Ej. Llega tu nueva promo"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Subtítulo</label>
                  <input
                    value={subheadline}
                    onChange={(event) => setSubheadline(event.target.value)}
                    placeholder="Ej. Disponible del 10 al 20 de junio"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Precio o promoción</label>
                  <input
                    value={priceOrOffer}
                    onChange={(event) => setPriceOrOffer(event.target.value)}
                    placeholder="Ej. $2,100 envío incluido"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">CTA</label>
                  <input
                    value={cta}
                    onChange={(event) => setCta(event.target.value)}
                    placeholder="Ej. Pide por WhatsApp"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-5 border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                4. Dirección visual
              </p>

              <div>
                <p className="mb-3 text-sm font-medium text-zinc-800">Qué debe transmitir</p>
                <div className="flex flex-wrap gap-2">
                  {emotions.map((emotion) => {
                    const selected = selectedEmotions.includes(emotion);
                    return (
                      <button
                        key={emotion}
                        type="button"
                        onClick={() => toggleSelection(emotion, selectedEmotions, setSelectedEmotions)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                          selected
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {emotion}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium text-zinc-800">Elementos que deben aparecer</p>
                <div className="flex flex-wrap gap-2">
                  {visualElements.map((element) => {
                    const selected = selectedVisualElements.includes(element);
                    return (
                      <button
                        key={element}
                        type="button"
                        onClick={() => toggleSelection(element, selectedVisualElements, setSelectedVisualElements)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                          selected
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {element}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800">Instrucciones puntuales</label>
                <textarea
                  value={specificInstructions}
                  onChange={(event) => setSpecificInstructions(event.target.value)}
                  placeholder="Ej. No mover el producto, que la imagen se sienta limpia y de alto valor, evitar exceso de texto."
                  className="min-h-28 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Contexto leído
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Brand Brain
              </h2>
              {!selectedClient ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Selecciona un cliente para ver la información que alimentará el prompt.
                </p>
              ) : (
                <div className="mt-5 space-y-4 text-sm leading-6 text-zinc-600">
                  <div>
                    <p className="font-semibold text-zinc-900">Descripción</p>
                    <p>{brandBrain?.brandDescription || "Sin descripción todavía."}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">Tono</p>
                    <p>{brandBrain?.tone || "Sin tono definido."}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">Estilo visual</p>
                    <p>{brandBrain?.visualStyle?.join(", ") || "Sin estilo definido."}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">Colores</p>
                    <p>{brandBrain?.colors?.join(", ") || "Sin colores registrados."}</p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Assets priorizados
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Usar en esta pieza
              </h2>

              {!selectedClient ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Selecciona un cliente para ver sus assets destacados.
                </p>
              ) : featuredAssets.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Este cliente aún no tiene assets destacados. Puedes seguir, pero conviene marcar al menos un logo o referencia.
                </p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {featuredAssets.map((asset) => {
                    const selected = selectedAssetIds.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleAsset(asset.id)}
                        className={`rounded-3xl border p-4 text-left transition ${
                          selected
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{asset.name}</p>
                            <p className={`mt-1 text-xs ${selected ? "text-zinc-300" : "text-zinc-500"}`}>
                              {asset.type} {asset.category ? `· ${asset.category}` : ""}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"}`}>
                            {selected ? "Usar" : "Omitir"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Motor de IA
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Selección del generador
              </h2>
              <div className="mt-5 space-y-2">
                <label className="text-sm font-medium text-zinc-800">Modelo</label>
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                >
                  {supportedModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Selección actual: <span className="font-semibold text-zinc-950">{selectedModelLabel}</span>
              </p>
            </section>

            {error ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-700">
                {success}
              </div>
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

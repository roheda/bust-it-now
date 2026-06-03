"use client";

import { onAuthStateChanged } from "firebase/auth";
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

type ClientRecord = {
  id: string;
  name: string;
  industry: string;
  status?: string;
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
  name?: string;
  role?: string;
  notes?: string;
  fileUrl?: string;
  storagePath?: string;
  mimeType?: string;
};

type LogoOverlayRecord = {
  enabled: boolean;
  assetId?: string;
  assetName?: string;
  fileUrl?: string;
  position?: string;
  size?: string;
};

type OriginalRequest = {
  id: string;
  clientId?: string;
  clientName?: string;
  clientIndustry?: string;
  format?: string;
  goal?: string;
  contentType?: string;
  mainMessage?: string;
  copy?: {
    headline?: string;
    subheadline?: string;
    cta?: string;
    priceOrOffer?: string;
  };
  selectedEmotions?: string[];
  selectedVisualElements?: string[];
  specificInstructions?: string;
  selectedModel?: string;
  selectedModelLabel?: string;
  brandBrainSnapshot?: BrandBrain;
  selectedAssetIds?: string[];
  selectedAssetsSnapshot?: AssetRecord[];
  requestAttachments?: RequestAttachmentRecord[];
  logoOverlay?: LogoOverlayRecord;
};

type EditableAttachment = RequestAttachmentRecord & {
  localId: string;
  keep: boolean;
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

const supportedModels = [
  { id: "draft-mini-low", label: "Borrador económico · GPT Image Mini" },
  { id: "nano-banana", label: "Calidad para redes · Nano Banana" },
  { id: "gpt-image", label: "GPT Image estándar" },
];

const requestAttachmentRoles = [
  { id: "producto-principal", label: "Producto principal" },
  { id: "platillo-principal", label: "Platillo principal" },
  { id: "referencia-visual", label: "Referencia visual" },
  { id: "fondo-ambiente", label: "Fondo / ambiente" },
  { id: "promocion", label: "Promoción" },
];

const logoPositions = [
  { id: "top-left", label: "Arriba izquierda" },
  { id: "top-right", label: "Arriba derecha" },
  { id: "bottom-left", label: "Abajo izquierda" },
  { id: "bottom-right", label: "Abajo derecha" },
  { id: "bottom-center", label: "Centro inferior" },
];

const logoSizes = [
  { id: "small", label: "Chico" },
  { id: "medium", label: "Mediano" },
  { id: "large", label: "Grande" },
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

function mapModelLabel(modelId: string) {
  return supportedModels.find((model) => model.id === modelId)?.label ?? modelId;
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

function isLogoAsset(asset: AssetRecord) {
  const type = asset.type.toLowerCase();
  const category = asset.category.toLowerCase();
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  return (
    isImageAsset(asset) &&
    (type === "logo" ||
      category === "logo" ||
      tags.includes("logo") ||
      tags.includes("logotipo"))
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

export default function ReuseBriefPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const requestId = params.requestId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [originalRequest, setOriginalRequest] = useState<OriginalRequest | null>(null);

  const [clients, setClients] = useState<ClientRecord[]>([]);
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
  const [priceOrOffer, setPriceOrOffer] = useState("");
  const [cta, setCta] = useState("");
  const [specificInstructions, setSpecificInstructions] = useState("");
  const [selectedModel, setSelectedModel] = useState("draft-mini-low");
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [selectedVisualElements, setSelectedVisualElements] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const [existingAttachments, setExistingAttachments] = useState<EditableAttachment[]>([]);
  const [requestImageFile, setRequestImageFile] = useState<File | null>(null);
  const [requestImagePreview, setRequestImagePreview] = useState("");
  const [requestImageName, setRequestImageName] = useState("");
  const [requestImageRole, setRequestImageRole] = useState("producto-principal");
  const [requestImageNotes, setRequestImageNotes] = useState("");

  const [logoOverlayEnabled, setLogoOverlayEnabled] = useState(false);
  const [selectedLogoAssetId, setSelectedLogoAssetId] = useState("");
  const [logoPosition, setLogoPosition] = useState("bottom-right");
  const [logoSize, setLogoSize] = useState("medium");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
      await loadInitialData();
    });

    return () => unsubscribe();
  }, [requestId, router]);

  useEffect(() => {
    return () => {
      if (requestImagePreview) {
        URL.revokeObjectURL(requestImagePreview);
      }
    };
  }, [requestImagePreview]);

  async function loadInitialData() {
    setIsLoading(true);
    setError("");

    try {
      const [requestSnapshot, clientsSnapshot] = await Promise.all([
        getDoc(doc(db, "generationRequests", requestId)),
        getDocs(query(collection(db, "clients"))),
      ]);

      if (!requestSnapshot.exists()) {
        setError("No encontramos este brief para reutilizar.");
        return;
      }

      const loadedClients = clientsSnapshot.docs
        .map((clientDocument) => {
          const data = clientDocument.data();

          return {
            id: clientDocument.id,
            name: typeof data.name === "string" ? data.name : "Cliente sin nombre",
            industry: typeof data.industry === "string" ? data.industry : "",
            status: typeof data.status === "string" ? data.status : "active",
          } satisfies ClientRecord;
        })
        .filter((client) => client.status !== "deleted")
        .sort((a, b) => a.name.localeCompare(b.name, "es"));

      setClients(loadedClients);

      const data = requestSnapshot.data();
      const loadedRequest = {
        id: requestSnapshot.id,
        ...data,
      } as OriginalRequest;

      setOriginalRequest(loadedRequest);
      setFormat(loadedRequest.format || "instagram-post");
      setGoal(loadedRequest.goal || "sell");
      setContentType(loadedRequest.contentType || "promotion");
      setMainMessage(loadedRequest.mainMessage || "");
      setHeadline(loadedRequest.copy?.headline || "");
      setSubheadline(loadedRequest.copy?.subheadline || "");
      setPriceOrOffer(loadedRequest.copy?.priceOrOffer || "");
      setCta(loadedRequest.copy?.cta || "");
      setSpecificInstructions(loadedRequest.specificInstructions || "");
      setSelectedModel(loadedRequest.selectedModel || "draft-mini-low");
      setSelectedEmotions(loadedRequest.selectedEmotions || []);
      setSelectedVisualElements(loadedRequest.selectedVisualElements || []);
      setExistingAttachments(
        (loadedRequest.requestAttachments || []).map((attachment, index) => ({
          ...attachment,
          localId: `${attachment.fileUrl || "attachment"}-${index}`,
          keep: true,
        })),
      );

      const initialClientId = loadedRequest.clientId || "";
      setSelectedClientId(initialClientId);
      await loadClientContext(initialClientId, loadedRequest, false);
    } catch (loadError) {
      console.error(loadError);
      setError("No pudimos cargar el brief original.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadClientContext(
    clientId: string,
    sourceRequest: OriginalRequest | null = originalRequest,
    resetVisualChoices = false,
  ) {
    setIsLoadingContext(true);
    setError("");

    try {
      if (!clientId) {
        setSelectedClient(null);
        setBrandBrain(null);
        setClientAssets([]);
        setSelectedAssetIds([]);
        return;
      }

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

      const sourceAssetIds = sourceRequest?.selectedAssetIds || [];
      const validSourceAssetIds = sourceAssetIds.filter((assetId) =>
        loadedAssets.some((asset) => asset.id === assetId && !isLogoAsset(asset)),
      );

      if (resetVisualChoices || validSourceAssetIds.length === 0) {
        setSelectedAssetIds(
          loadedAssets
            .filter((asset) => asset.isFeatured && !isLogoAsset(asset))
            .map((asset) => asset.id),
        );
      } else {
        setSelectedAssetIds(validSourceAssetIds);
      }

      const logoAssets = loadedAssets.filter(isLogoAsset);
      const sourceLogoOverlay = sourceRequest?.logoOverlay;
      const sourceLogoStillExists = logoAssets.some(
        (asset) => asset.id === sourceLogoOverlay?.assetId,
      );
      const firstLogoAsset = logoAssets[0];

      setLogoOverlayEnabled(sourceLogoOverlay?.enabled === true && sourceLogoStillExists);
      setSelectedLogoAssetId(
        sourceLogoStillExists
          ? sourceLogoOverlay?.assetId || ""
          : firstLogoAsset?.id || "",
      );
      setLogoPosition(sourceLogoOverlay?.position || "bottom-right");
      setLogoSize(sourceLogoOverlay?.size || "medium");
    } catch (contextError) {
      console.error(contextError);
      setError("No pudimos cargar el Brand Brain y los assets del cliente.");
    } finally {
      setIsLoadingContext(false);
    }
  }

  async function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    await loadClientContext(clientId, originalRequest, true);
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

  function updateExistingAttachment(
    localId: string,
    patch: Partial<EditableAttachment>,
  ) {
    setExistingAttachments((currentAttachments) =>
      currentAttachments.map((attachment) =>
        attachment.localId === localId ? { ...attachment, ...patch } : attachment,
      ),
    );
  }

  async function handleSaveReusableBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!originalRequest) {
      setError("No encontramos el brief original.");
      return;
    }

    if (!selectedClientId || !selectedClient) {
      setError("Selecciona un cliente.");
      return;
    }

    if (!mainMessage.trim()) {
      setError("Escribe qué debe entender la persona en 3 segundos.");
      return;
    }

    const selectedLogoAsset = clientAssets.find((asset) => asset.id === selectedLogoAssetId);

    if (logoOverlayEnabled && !selectedLogoAsset) {
      setError("Selecciona un logo oficial o desactiva la opción de logo fijo.");
      return;
    }

    setIsSaving(true);

    try {
      const selectedAssetsSnapshot = clientAssets.filter((asset) =>
        selectedAssetIds.includes(asset.id),
      );

      const logoOverlay: LogoOverlayRecord = logoOverlayEnabled && selectedLogoAsset
        ? {
            enabled: true,
            assetId: selectedLogoAsset.id,
            assetName: selectedLogoAsset.name,
            fileUrl: selectedLogoAsset.fileUrl,
            position: logoPosition,
            size: logoSize,
          }
        : {
            enabled: false,
          };

      const keptAttachments: RequestAttachmentRecord[] = existingAttachments
        .filter((attachment) => attachment.keep)
        .map((attachment) => ({
          name: attachment.name || "Referencia puntual",
          role: attachment.role || "referencia-visual",
          notes: attachment.notes || "",
          fileUrl: attachment.fileUrl || "",
          storagePath: attachment.storagePath || "",
          mimeType: attachment.mimeType || "",
        }));

      const newRequestRef = await addDoc(collection(db, "generationRequests"), {
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
        requestAttachments: keptAttachments,
        logoOverlay,
        clonedFromRequestId: originalRequest.id,
        status: requestImageFile ? "saving_assets" : "brief_ready",
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const finalAttachments = [...keptAttachments];

      if (requestImageFile) {
        const storagePath = `generation-attachments/${selectedClientId}/${newRequestRef.id}/${Date.now()}-${safeFileName(requestImageFile.name)}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, requestImageFile, {
          contentType: requestImageFile.type,
        });

        const fileUrl = await getDownloadURL(storageRef);

        finalAttachments.push({
          name: requestImageName.trim() || requestImageFile.name,
          role: requestImageRole,
          notes: requestImageNotes.trim(),
          fileUrl,
          storagePath,
          mimeType: requestImageFile.type,
        });
      }

      if (requestImageFile) {
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(newRequestRef, {
          requestAttachments: finalAttachments,
          status: "brief_ready",
          updatedAt: serverTimestamp(),
        });
      }

      router.push(`/dashboard/generador/${newRequestRef.id}`);
    } catch (saveError) {
      console.error(saveError);
      setError("No pudimos crear el nuevo brief reutilizado.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedAssets = clientAssets.filter((asset) => selectedAssetIds.includes(asset.id));
  const logoAssets = clientAssets.filter(isLogoAsset);
  const selectedLogoAsset = logoAssets.find((asset) => asset.id === selectedLogoAssetId);
  const selectedModelLabel = useMemo(() => mapModelLabel(selectedModel), [selectedModel]);

  if (isCheckingSession || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] px-6 py-5 text-sm text-zinc-200">
          Cargando brief...
        </div>
      </main>
    );
  }

  if (!originalRequest) {
    return (
      <main className="min-h-screen bg-zinc-100 px-6 py-8 text-zinc-950">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error || "No encontramos este brief."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl shadow-zinc-300/60 sm:p-8">
          <Link
            href="/dashboard/historial"
            className="mb-5 inline-flex text-sm font-medium text-zinc-300 transition hover:text-white"
          >
            ← Volver al historial
          </Link>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Reusar brief
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Editor completo del brief
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Edita contenido, assets, referencias puntuales y logo. Al guardar se crea un nuevo request, conservando el original intacto.
          </p>
        </header>

        <form className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]" onSubmit={handleSaveReusableBrief}>
          <section className="space-y-6 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <section className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">1. Cliente y contexto</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Marca del nuevo request</h2>
              </div>

              <SelectField
                label="Cliente"
                value={selectedClientId}
                onChange={handleClientChange}
                options={clients.map((client) => ({ id: client.id, label: client.name }))}
              />

              {isLoadingContext ? (
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">Cargando assets y Brand Brain...</div>
              ) : null}

              {selectedClient ? (
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
                  <p><span className="font-semibold text-zinc-950">Cliente:</span> {selectedClient.name}</p>
                  <p><span className="font-semibold text-zinc-950">Giro:</span> {selectedClient.industry || "Sin categoría"}</p>
                  <p><span className="font-semibold text-zinc-950">Modelo actual:</span> {selectedModelLabel}</p>
                </div>
              ) : null}
            </section>

            <section className="space-y-5 border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">2. Datos de la pieza</p>
              <div className="grid gap-5 md:grid-cols-3">
                <SelectField label="Formato" value={format} onChange={setFormat} options={formats} />
                <SelectField label="Objetivo" value={goal} onChange={setGoal} options={goals} />
                <SelectField label="Tipo de contenido" value={contentType} onChange={setContentType} options={contentTypes} />
              </div>
            </section>

            <section className="space-y-5 border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">3. Mensaje</p>
              <TextAreaField
                label="Qué debe entender la persona en 3 segundos"
                value={mainMessage}
                onChange={setMainMessage}
                placeholder="Mensaje principal del brief"
                required
              />
              <div className="grid gap-5 md:grid-cols-2">
                <InputField label="Titular dentro de la imagen" value={headline} onChange={setHeadline} placeholder="Titular" />
                <InputField label="Subtítulo" value={subheadline} onChange={setSubheadline} placeholder="Subtítulo" />
                <InputField label="Precio o promoción" value={priceOrOffer} onChange={setPriceOrOffer} placeholder="Precio u oferta" />
                <InputField label="CTA" value={cta} onChange={setCta} placeholder="CTA" />
              </div>
              <TextAreaField
                label="Instrucciones puntuales"
                value={specificInstructions}
                onChange={setSpecificInstructions}
                placeholder="Ajustes, cambios o indicaciones para esta nueva versión."
              />
            </section>

            <section className="space-y-5 border-t border-zinc-200 pt-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">4. Dirección visual</p>
              <ChipSelector label="Qué debe transmitir" values={emotions} selectedValues={selectedEmotions} onToggle={(value) => setSelectedEmotions(toggleArrayValue(value, selectedEmotions))} />
              <ChipSelector label="Elementos que deben aparecer" values={visualElements} selectedValues={selectedVisualElements} onToggle={(value) => setSelectedVisualElements(toggleArrayValue(value, selectedVisualElements))} />
            </section>

            <section className="space-y-5 border-t border-zinc-200 pt-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">5. Referencias puntuales</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">Puedes conservar, quitar, editar o sumar una nueva imagen puntual para esta versión.</p>
              </div>

              {existingAttachments.length > 0 ? (
                <div className="grid gap-4">
                  {existingAttachments.map((attachment) => (
                    <div key={attachment.localId} className={`rounded-3xl border p-4 ${attachment.keep ? "border-zinc-200 bg-zinc-50" : "border-red-200 bg-red-50"}`}>
                      <div className="grid gap-4 md:grid-cols-[120px_1fr]">
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2">
                          {attachment.fileUrl ? <img src={attachment.fileUrl} alt={attachment.name || "Referencia"} className="h-28 w-full object-contain" /> : null}
                        </div>
                        <div className="space-y-3">
                          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                            <input type="checkbox" checked={attachment.keep} onChange={(event) => updateExistingAttachment(attachment.localId, { keep: event.target.checked })} />
                            Conservar esta referencia
                          </label>
                          <div className="grid gap-3 md:grid-cols-2">
                            <InputField label="Nombre" value={attachment.name || ""} onChange={(value) => updateExistingAttachment(attachment.localId, { name: value })} placeholder="Nombre de referencia" />
                            <SelectField label="Rol" value={attachment.role || "referencia-visual"} onChange={(value) => updateExistingAttachment(attachment.localId, { role: value })} options={requestAttachmentRoles} />
                          </div>
                          <TextAreaField label="Notas" value={attachment.notes || ""} onChange={(value) => updateExistingAttachment(attachment.localId, { notes: value })} placeholder="Instrucción para esta referencia" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6 text-sm text-zinc-600">El brief original no tenía referencias puntuales.</p>
              )}

              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">Agregar nueva referencia</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(event) => handleRequestImageChange(event.target.files?.[0] || null)}
                  className="mt-3 block w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
                />
                {requestImagePreview ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr] md:items-start">
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2">
                      <img src={requestImagePreview} alt="Nueva referencia" className="h-36 w-full object-contain" />
                    </div>
                    <div className="space-y-3">
                      <InputField label="Nombre" value={requestImageName} onChange={setRequestImageName} placeholder="Nombre de archivo" />
                      <SelectField label="Rol" value={requestImageRole} onChange={setRequestImageRole} options={requestAttachmentRoles} />
                      <TextAreaField label="Notas" value={requestImageNotes} onChange={setRequestImageNotes} placeholder="Instrucción sobre esta nueva imagen" />
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Assets del cliente</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Editar selección</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Los logos se manejan aparte como capa fija. Los demás assets pueden activarse o quitarse para este nuevo request.</p>

              {clientAssets.length === 0 ? (
                <p className="mt-5 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6 text-sm text-zinc-600">Este cliente no tiene assets cargados.</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {clientAssets.map((asset) => {
                    const selected = selectedAssetIds.includes(asset.id);
                    const imageAsset = isImageAsset(asset);
                    const logoAsset = isLogoAsset(asset);

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          if (!logoAsset) {
                            setSelectedAssetIds(toggleArrayValue(asset.id, selectedAssetIds));
                          }
                        }}
                        disabled={logoAsset}
                        className={`rounded-3xl border p-4 text-left transition ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-white"} ${logoAsset ? "cursor-not-allowed opacity-80" : ""}`}
                      >
                        <div className="grid grid-cols-[56px_1fr] items-center gap-3">
                          <div className={`overflow-hidden rounded-2xl border ${selected ? "border-white/20 bg-white/10" : "border-zinc-200 bg-white"}`}>
                            {imageAsset ? <img src={asset.fileUrl} alt={asset.name} className="h-14 w-full object-contain p-2" /> : <div className="flex h-14 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.12em]">File</div>}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{asset.name}</p>
                            <p className={`mt-1 text-xs ${selected ? "text-zinc-300" : "text-zinc-500"}`}>{asset.type || "asset"} {asset.category ? `· ${asset.category}` : ""}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"}`}>{logoAsset ? "Se elige en logo" : selected ? "Usar" : "Omitir"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Logo oficial opcional</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Editar logo fijo</h2>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-900">
                <input
                  type="checkbox"
                  checked={logoOverlayEnabled}
                  onChange={(event) => setLogoOverlayEnabled(event.target.checked)}
                  disabled={logoAssets.length === 0}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Agregar logo oficial como capa fija
                  <span className="mt-1 block text-sm font-normal leading-6 text-zinc-600">
                    {logoAssets.length > 0 ? "Opcional por pieza. Se pega como capa real al final." : "Este cliente no tiene assets marcados como logo."}
                  </span>
                </span>
              </label>

              {logoOverlayEnabled && logoAssets.length > 0 ? (
                <div className="mt-5 space-y-4">
                  <SelectField label="Logo oficial" value={selectedLogoAssetId} onChange={setSelectedLogoAssetId} options={logoAssets.map((asset) => ({ id: asset.id, label: asset.name }))} />
                  <SelectField label="Posición" value={logoPosition} onChange={setLogoPosition} options={logoPositions} />
                  <SelectField label="Tamaño" value={logoSize} onChange={setLogoSize} options={logoSizes} />
                  {selectedLogoAsset ? (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <img src={selectedLogoAsset.fileUrl} alt={selectedLogoAsset.name} className="h-20 w-full object-contain" />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Motor de IA</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Modelo</h2>
              <div className="mt-5">
                <SelectField label="Modelo" value={selectedModel} onChange={setSelectedModel} options={supportedModels} />
              </div>
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Resumen</p>
              <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                <p><span className="font-semibold text-zinc-950">{selectedAssets.length}</span> asset(s) seleccionados.</p>
                <p><span className="font-semibold text-zinc-950">{existingAttachments.filter((attachment) => attachment.keep).length + (requestImageFile ? 1 : 0)}</span> referencia(s) puntual(es).</p>
                <p><span className="font-semibold text-zinc-950">{logoOverlayEnabled ? "Sí" : "No"}</span> lleva logo fijo.</p>
              </div>

              {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Creando nuevo brief..." : "Crear nuevo request editado"}
                </button>
                <Link
                  href={`/dashboard/generador/${originalRequest.id}`}
                  className="flex h-12 w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
                >
                  Abrir original
                </Link>
              </div>
            </section>
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

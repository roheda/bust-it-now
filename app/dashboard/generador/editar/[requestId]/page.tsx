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
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";

type ClientRecord = {
  id: string;
  name: string;
  industry: string;
  status?: string;
};

type TextBlock = {
  id: string;
  text: string;
  role: string;
  priority: string;
  instruction: string;
  locked: boolean;
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

type OriginalRequest = {
  id: string;
  clientId?: string;
  clientName?: string;
  clientIndustry?: string;
  format?: string;
  goal?: string;
  contentType?: string;
  mainMessage?: string;
  textBlocks?: TextBlock[];
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

const textBlockRoles = [
  { id: "headline", label: "Titular protagonista" },
  { id: "subheadline", label: "Frase secundaria" },
  { id: "claim", label: "Claim / frase de campaña" },
  { id: "badge", label: "Sello / badge" },
  { id: "bullet", label: "Bullet" },
  { id: "price", label: "Precio" },
  { id: "promotion", label: "Promoción" },
  { id: "cta", label: "CTA" },
  { id: "date", label: "Fecha" },
  { id: "location", label: "Ubicación" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "free", label: "Texto libre" },
];

const textBlockPriorities = [
  { id: "high", label: "Alta" },
  { id: "medium", label: "Media" },
  { id: "low", label: "Baja" },
];

const requestAttachmentRoles = [
  { id: "producto-principal", label: "Producto principal" },
  { id: "platillo-principal", label: "Platillo principal" },
  { id: "referencia-visual", label: "Referencia visual" },
  { id: "fondo-ambiente", label: "Fondo / ambiente" },
  { id: "promocion", label: "Promoción" },
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
  "Precio",
  "Fecha",
  "CTA",
  "Fondo limpio",
  "Textura o patrón de marca",
];

function textBlockRoleLabel(role: string) {
  return textBlockRoles.find((item) => item.id === role)?.label ?? role;
}

function textBlockPriorityLabel(priority: string) {
  return textBlockPriorities.find((item) => item.id === priority)?.label ?? priority;
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

function createTextBlockId() {
  return `text-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyTextBlock(): TextBlock {
  return {
    id: createTextBlockId(),
    text: "",
    role: "headline",
    priority: "high",
    instruction: "",
    locked: true,
  };
}

function normalizeTextBlocks(value: unknown): TextBlock[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const block = item as Partial<TextBlock>;

      return {
        id: typeof block.id === "string" && block.id ? block.id : createTextBlockId(),
        text: typeof block.text === "string" ? block.text : "",
        role: typeof block.role === "string" ? block.role : "free",
        priority: typeof block.priority === "string" ? block.priority : "medium",
        instruction: typeof block.instruction === "string" ? block.instruction : "",
        locked: block.locked !== false,
      } satisfies TextBlock;
    })
    .filter((block): block is TextBlock => Boolean(block))
    .filter((block) => block.text.trim().length > 0);
}

function legacyCopyToBlocks(copy?: OriginalRequest["copy"]): TextBlock[] {
  const blocks: TextBlock[] = [];

  if (copy?.headline?.trim()) {
    blocks.push({ ...createEmptyTextBlock(), text: copy.headline.trim(), role: "headline", priority: "high" });
  }

  if (copy?.subheadline?.trim()) {
    blocks.push({ ...createEmptyTextBlock(), text: copy.subheadline.trim(), role: "subheadline", priority: "medium" });
  }

  if (copy?.priceOrOffer?.trim()) {
    blocks.push({ ...createEmptyTextBlock(), text: copy.priceOrOffer.trim(), role: "promotion", priority: "high" });
  }

  if (copy?.cta?.trim()) {
    blocks.push({ ...createEmptyTextBlock(), text: copy.cta.trim(), role: "cta", priority: "low" });
  }

  return blocks;
}

function cleanTextBlocks(blocks: TextBlock[]) {
  return blocks
    .filter((block) => block.text.trim().length > 0)
    .map((block) => ({
      id: block.id || createTextBlockId(),
      text: block.text.trim(),
      role: block.role,
      roleLabel: textBlockRoleLabel(block.role),
      priority: block.priority,
      priorityLabel: textBlockPriorityLabel(block.priority),
      instruction: block.instruction.trim(),
      locked: block.locked !== false,
    }));
}

function deriveLegacyCopy(blocks: ReturnType<typeof cleanTextBlocks>) {
  const byRole = (roles: string[]) => blocks.find((block) => roles.includes(block.role))?.text || "";

  return {
    headline: byRole(["headline", "claim"]),
    subheadline: byRole(["subheadline", "bullet"]),
    priceOrOffer: byRole(["price", "promotion"]),
    cta: byRole(["cta"]),
  };
}

export default function ReuseBriefPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const requestId = params.requestId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTextBlocks, setIsSavingTextBlocks] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [originalRequest, setOriginalRequest] = useState<OriginalRequest | null>(null);

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [brandBrain, setBrandBrain] = useState<BrandBrain | null>(null);
  const [clientAssets, setClientAssets] = useState<AssetRecord[]>([]);
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([createEmptyTextBlock()]);

  const [format, setFormat] = useState("instagram-post");
  const [goal, setGoal] = useState("sell");
  const [contentType, setContentType] = useState("promotion");
  const [mainMessage, setMainMessage] = useState("");
  const [specificInstructions, setSpecificInstructions] = useState("");
  const selectedModel = "draft-mini-low";
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [selectedVisualElements, setSelectedVisualElements] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const [existingAttachments, setExistingAttachments] = useState<EditableAttachment[]>([]);
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

      const requestTextBlocks = normalizeTextBlocks(loadedRequest.textBlocks);
      const legacyBlocks = legacyCopyToBlocks(loadedRequest.copy);

      setOriginalRequest(loadedRequest);
      setFormat(loadedRequest.format || "instagram-post");
      setGoal(loadedRequest.goal || "sell");
      setContentType(loadedRequest.contentType || "promotion");
      setMainMessage(loadedRequest.mainMessage || "");
      setTextBlocks(requestTextBlocks.length > 0 ? requestTextBlocks : legacyBlocks.length > 0 ? legacyBlocks : [createEmptyTextBlock()]);
      setSpecificInstructions(loadedRequest.specificInstructions || "");
      setSelectedEmotions(loadedRequest.selectedEmotions || []);
      setSelectedVisualElements((loadedRequest.selectedVisualElements || []).filter((item) => item !== "Logo visible"));
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

      if (resetVisualChoices) {
        const clientTextBlocks = normalizeTextBlocks(clientData.textBlocks);
        setTextBlocks(clientTextBlocks.length > 0 ? clientTextBlocks : [createEmptyTextBlock()]);
      } else if (!sourceRequest?.textBlocks?.length && !sourceRequest?.copy) {
        const clientTextBlocks = normalizeTextBlocks(clientData.textBlocks);
        if (clientTextBlocks.length > 0) setTextBlocks(clientTextBlocks);
      }

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

  function updateTextBlock<K extends keyof TextBlock>(blockId: string, field: K, value: TextBlock[K]) {
    setTextBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              [field]: value,
            }
          : block,
      ),
    );
  }

  function addTextBlock() {
    setTextBlocks((currentBlocks) => [...currentBlocks, createEmptyTextBlock()]);
  }

  function removeTextBlock(blockId: string) {
    setTextBlocks((currentBlocks) => {
      const remainingBlocks = currentBlocks.filter((block) => block.id !== blockId);
      return remainingBlocks.length > 0 ? remainingBlocks : [createEmptyTextBlock()];
    });
  }

  async function saveClientTextBlocks() {
    setError("");
    setSuccess("");

    if (!selectedClientId) {
      setError("Selecciona un cliente para guardar sus bloques.");
      return;
    }

    const blocksToSave = cleanTextBlocks(textBlocks);

    if (blocksToSave.length === 0) {
      setError("Agrega al menos un bloque con texto antes de guardarlo en el cliente.");
      return;
    }

    setIsSavingTextBlocks(true);

    try {
      await updateDoc(doc(db, "clients", selectedClientId), {
        textBlocks: blocksToSave,
        updatedAt: serverTimestamp(),
      });

      setTextBlocks(blocksToSave);
      setSuccess("Bloques guardados en el cliente.");
    } catch (saveBlocksError) {
      console.error(saveBlocksError);
      setError("No pudimos guardar los bloques del cliente.");
    } finally {
      setIsSavingTextBlocks(false);
    }
  }

  async function handleSaveReusableBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

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

    const cleanedTextBlocks = cleanTextBlocks(textBlocks);

    if (cleanedTextBlocks.length === 0) {
      setError("Agrega al menos un bloque de texto para esta nueva versión.");
      return;
    }

    setIsSaving(true);

    try {
      const selectedAssetsSnapshot = clientAssets.filter((asset) =>
        selectedAssetIds.includes(asset.id),
      );

      await updateDoc(doc(db, "clients", selectedClientId), {
        textBlocks: cleanedTextBlocks,
        updatedAt: serverTimestamp(),
      });

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
        textBlocks: cleanedTextBlocks,
        copy: deriveLegacyCopy(cleanedTextBlocks),
        selectedEmotions,
        selectedVisualElements: selectedVisualElements.filter((item) => item !== "Logo visible"),
        specificInstructions: specificInstructions.trim(),
        selectedModel,
        selectedModelLabel: "Borrador económico · GPT Image Mini",
        brandBrainSnapshot: brandBrain ?? {},
        selectedAssetIds,
        selectedAssetsSnapshot,
        requestAttachments: keptAttachments,
        logoOverlay: { enabled: false },
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
  const selectedImageAssetsCount = selectedAssets.filter(isImageAsset).length;

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
            Edita contenido, bloques de texto, assets y referencias puntuales. El logo se agrega después desde el editor post-generación.
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
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">Cargando assets, bloques y Brand Brain...</div>
              ) : null}

              {selectedClient ? (
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
                  <p><span className="font-semibold text-zinc-950">Cliente:</span> {selectedClient.name}</p>
                  <p><span className="font-semibold text-zinc-950">Giro:</span> {selectedClient.industry || "Sin categoría"}</p>
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
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">3. Mensaje y bloques de texto</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Este editor ya usa el nuevo sistema de bloques. Si el brief original era viejo, convertimos titular, subtítulo, precio y CTA a bloques editables.
                </p>
              </div>

              <TextAreaField
                label="Qué debe entender la persona en 3 segundos"
                value={mainMessage}
                onChange={setMainMessage}
                placeholder="Mensaje principal del brief"
                required
              />

              <div className="space-y-4">
                {textBlocks.map((block, index) => (
                  <div key={block.id} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">Bloque {index + 1}</p>
                        <p className="text-xs text-zinc-500">{textBlockRoleLabel(block.role)} · Prioridad {textBlockPriorityLabel(block.priority).toLowerCase()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTextBlock(block.id)}
                        className="inline-flex h-9 items-center justify-center rounded-2xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-zinc-800">Texto</label>
                        <textarea
                          value={block.text}
                          onChange={(event) => updateTextBlock(block.id, "text", event.target.value)}
                          placeholder="Ej. BLACK WEEK"
                          className="min-h-20 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-zinc-950"
                        />
                      </div>

                      <SelectField
                        label="Uso visual"
                        value={block.role}
                        onChange={(value) => updateTextBlock(block.id, "role", value)}
                        options={textBlockRoles}
                      />

                      <SelectField
                        label="Prioridad"
                        value={block.priority}
                        onChange={(value) => updateTextBlock(block.id, "priority", value)}
                        options={textBlockPriorities}
                      />

                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-zinc-800">Instrucción para este bloque</label>
                        <input
                          value={block.instruction}
                          onChange={(event) => updateTextBlock(block.id, "instruction", event.target.value)}
                          placeholder="Ej. usar como sello pequeño en esquina superior"
                          className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                        />
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 md:col-span-2">
                        <input
                          type="checkbox"
                          checked={block.locked}
                          onChange={(event) => updateTextBlock(block.id, "locked", event.target.checked)}
                          className="h-4 w-4"
                        />
                        Mantener este texto exacto, sin reescribirlo
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={addTextBlock}
                  className="flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50"
                >
                  + Agregar bloque
                </button>
                <button
                  type="button"
                  onClick={saveClientTextBlocks}
                  disabled={isSavingTextBlocks || !selectedClientId}
                  className="flex h-11 items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSavingTextBlocks ? "Guardando bloques..." : "Guardar bloques del cliente"}
                </button>
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
              <p className="mt-2 text-sm leading-6 text-zinc-600">Los logos no se seleccionan aquí; se agregan después con el editor de logo post-generación.</p>

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
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{asset.name}</p>
                              {logoAsset ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-800">
                                  Logo post-generación
                                </span>
                              ) : null}
                            </div>
                            <p className={`mt-1 text-xs ${selected ? "text-zinc-300" : "text-zinc-500"}`}>{asset.type || "asset"} {asset.category ? `· ${asset.category}` : ""}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"}`}>{logoAsset ? "No viaja al brief" : selected ? "Usar" : "Omitir"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Resumen</p>
              <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                <p><span className="font-semibold text-zinc-950">{cleanTextBlocks(textBlocks).length}</span> bloque(s) de texto.</p>
                <p><span className="font-semibold text-zinc-950">{selectedAssets.length}</span> asset(s) seleccionados.</p>
                <p><span className="font-semibold text-zinc-950">{selectedImageAssetsCount}</span> asset(s) de imagen.</p>
                <p><span className="font-semibold text-zinc-950">{existingAttachments.filter((attachment) => attachment.keep).length + (requestImageFile ? 1 : 0)}</span> referencia(s) puntual(es).</p>
                <p><span className="font-semibold text-zinc-950">No</span> lleva logo fijo en el brief.</p>
              </div>

              {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
              {success ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

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

"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";

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
  brandBrainSnapshot?: object;
  selectedAssetIds?: string[];
  selectedAssetsSnapshot?: unknown[];
  requestAttachments?: unknown[];
  logoOverlay?: object;
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

function mapModelLabel(modelId: string) {
  return supportedModels.find((model) => model.id === modelId)?.label ?? modelId;
}

export default function ReuseBriefPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const requestId = params.requestId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [originalRequest, setOriginalRequest] = useState<OriginalRequest | null>(null);

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
      await loadRequest();
    });

    return () => unsubscribe();
  }, [requestId, router]);

  async function loadRequest() {
    setIsLoading(true);
    setError("");

    try {
      const snapshot = await getDoc(doc(db, "generationRequests", requestId));

      if (!snapshot.exists()) {
        setError("No encontramos este brief para reutilizar.");
        return;
      }

      const data = snapshot.data();
      const loadedRequest = {
        id: snapshot.id,
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
    } catch (loadError) {
      console.error(loadError);
      setError("No pudimos cargar el brief original.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveReusableBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!originalRequest) {
      setError("No encontramos el brief original.");
      return;
    }

    if (!mainMessage.trim()) {
      setError("Escribe qué debe entender la persona en 3 segundos.");
      return;
    }

    setIsSaving(true);

    try {
      const newRequestRef = await addDoc(collection(db, "generationRequests"), {
        clientId: originalRequest.clientId || null,
        clientName: originalRequest.clientName || "Cliente",
        clientIndustry: originalRequest.clientIndustry || "",
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
        selectedEmotions: originalRequest.selectedEmotions || [],
        selectedVisualElements: originalRequest.selectedVisualElements || [],
        specificInstructions: specificInstructions.trim(),
        selectedModel,
        selectedModelLabel: mapModelLabel(selectedModel),
        brandBrainSnapshot: originalRequest.brandBrainSnapshot || {},
        selectedAssetIds: originalRequest.selectedAssetIds || [],
        selectedAssetsSnapshot: originalRequest.selectedAssetsSnapshot || [],
        requestAttachments: originalRequest.requestAttachments || [],
        logoOverlay: originalRequest.logoOverlay || { enabled: false },
        clonedFromRequestId: originalRequest.id,
        status: "brief_ready",
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push(`/dashboard/generador/${newRequestRef.id}`);
    } catch (saveError) {
      console.error(saveError);
      setError("No pudimos crear el nuevo brief reutilizado.");
    } finally {
      setIsSaving(false);
    }
  }

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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
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
            {originalRequest.clientName || "Cliente"}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Edita los campos principales y crea un nuevo request a partir del brief original. Se conservan assets, referencias puntuales, Brand Brain y configuración de logo.
          </p>
        </header>

        <form className="space-y-6 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={handleSaveReusableBrief}>
          <div className="grid gap-5 md:grid-cols-3">
            <SelectField label="Formato" value={format} onChange={setFormat} options={formats} />
            <SelectField label="Objetivo" value={goal} onChange={setGoal} options={goals} />
            <SelectField label="Tipo de contenido" value={contentType} onChange={setContentType} options={contentTypes} />
          </div>

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

          <SelectField label="Modelo de IA" value={selectedModel} onChange={setSelectedModel} options={supportedModels} />

          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
            <p>
              Se conservarán {originalRequest.selectedAssetsSnapshot?.length || 0} asset(s), {originalRequest.requestAttachments?.length || 0} referencia(s) puntual(es) y la configuración actual de logo.
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={isSaving}
              className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Creando nuevo brief..." : "Crear nuevo request editado"}
            </button>
            <Link
              href={`/dashboard/generador/${originalRequest.id}`}
              className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
            >
              Abrir original
            </Link>
          </div>
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
        className="min-h-32 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
      />
    </div>
  );
}

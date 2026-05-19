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
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  buildGenerationPrompt,
  type BuildPromptInput,
} from "@/lib/build-generation-prompt";

type GeneratedImageRecord = {
  id: string;
  imageUrl: string;
  requestedModel: string;
  executedModel: string;
};

type RequestData = BuildPromptInput & {
  id: string;
  clientId?: string;
  clientName?: string;
  clientIndustry?: string;
  selectedModel?: string;
  selectedModelLabel?: string;
  status?: string;
};

export default function GeneratorRequestDetailPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const requestId = params.requestId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestData, setRequestData] = useState<RequestData | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageRecord[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
      await loadRequest();
      await loadGeneratedImages();
    });

    return () => unsubscribe();
  }, [requestId, router]);

  async function loadRequest() {
    setIsLoading(true);
    setError("");

    try {
      const snapshot = await getDoc(doc(db, "generationRequests", requestId));

      if (!snapshot.exists()) {
        setError("No encontramos este request.");
        return;
      }

      const data = snapshot.data();

      setRequestData({
        id: snapshot.id,
        ...data,
      } as RequestData);
    } catch (loadError) {
      console.error(loadError);
      setError("No pudimos cargar el request.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadGeneratedImages() {
    try {
      const snapshot = await getDocs(
        query(collection(db, "generatedImages"), where("requestId", "==", requestId)),
      );

      const items = snapshot.docs.map((imageDocument) => {
        const data = imageDocument.data();

        return {
          id: imageDocument.id,
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
          requestedModel:
            typeof data.requestedModel === "string" ? data.requestedModel : "",
          executedModel:
            typeof data.executedModel === "string" ? data.executedModel : "",
        } satisfies GeneratedImageRecord;
      });

      setGeneratedImages(items);
    } catch (loadError) {
      console.error(loadError);
    }
  }

  const promptText = useMemo(() => {
    if (!requestData) return "";
    return buildGenerationPrompt(requestData);
  }, [requestData]);

  async function handleGenerateImage() {
    if (!requestData) return;

    setError("");
    setSuccess("");
    setIsGenerating(true);

    try {
      await updateDoc(doc(db, "generationRequests", requestId), {
        status: "generating",
        updatedAt: serverTimestamp(),
      });

      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptText,
          format: requestData.format,
          model: requestData.selectedModel || "auto",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No pudimos generar la imagen.");
      }

      const storagePath = `generated-images/${
        requestData.clientId || "unknown-client"
      }/${requestId}/${Date.now()}.png`;

      const storageRef = ref(storage, storagePath);

      await uploadString(storageRef, result.imageBase64, "base64", {
        contentType: "image/png",
      });

      const imageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "generatedImages"), {
        requestId,
        clientId: requestData.clientId || null,
        clientName: requestData.clientName || "",
        imageUrl,
        storagePath,
        prompt: promptText,
        requestedModel: requestData.selectedModel || "auto",
        requestedModelLabel: requestData.selectedModelLabel || "Automático",
        executedModel: result.executedModel,
        status: "completed",
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "generationRequests", requestId), {
        status: "completed",
        updatedAt: serverTimestamp(),
      });

      setSuccess("Imagen generada correctamente.");
      await loadGeneratedImages();
      await loadRequest();
    } catch (generationError) {
      console.error(generationError);

      await updateDoc(doc(db, "generationRequests", requestId), {
        status: "error",
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      setError(
        generationError instanceof Error
          ? generationError.message
          : "Error al generar imagen.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  if (isCheckingSession || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] px-6 py-5 text-sm text-zinc-200">
          Cargando request...
        </div>
      </main>
    );
  }

  if (!requestData) {
    return (
      <main className="min-h-screen bg-zinc-100 px-6 py-8 text-zinc-950">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error || "No encontramos este request."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl shadow-zinc-300/60 sm:p-8">
          <Link
            href="/dashboard/generador"
            className="mb-5 inline-flex text-sm font-medium text-zinc-300 transition hover:text-white"
          >
            ← Volver al generador
          </Link>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
            Request de generación
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {requestData.clientName || "Cliente"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Estado actual: {requestData.status || "brief_ready"}
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <section className="space-y-6 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Resumen del brief
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Datos del request
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Objetivo
                </p>
                <p className="mt-2 text-base font-medium text-zinc-900">
                  {requestData.goal || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Formato
                </p>
                <p className="mt-2 text-base font-medium text-zinc-900">
                  {requestData.format || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Tipo
                </p>
                <p className="mt-2 text-base font-medium text-zinc-900">
                  {requestData.contentType || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Modelo solicitado
                </p>
                <p className="mt-2 text-base font-medium text-zinc-900">
                  {requestData.selectedModelLabel || requestData.selectedModel || "-"}
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Mensaje principal</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {requestData.mainMessage || "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-zinc-900">Copy</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Headline: {requestData.copy?.headline || "-"}
                  <br />
                  Subheadline: {requestData.copy?.subheadline || "-"}
                  <br />
                  Precio / oferta: {requestData.copy?.priceOrOffer || "-"}
                  <br />
                  CTA: {requestData.copy?.cta || "-"}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-zinc-900">Dirección visual</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Emociones: {requestData.selectedEmotions?.join(", ") || "-"}
                  <br />
                  Elementos: {requestData.selectedVisualElements?.join(", ") || "-"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Prompt final
              </p>
              <textarea
                value={promptText}
                readOnly
                className="mt-3 min-h-[420px] w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-800 outline-none"
              />
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Acción
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Generar imagen
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                En v1, la generación real se ejecuta con GPT Image aunque el request conserve el modelo solicitado para la arquitectura futura multi-modelo.
              </p>

              {error ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="mt-6 flex h-14 w-full items-center justify-center rounded-3xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isGenerating ? "Generando..." : "Generar imagen"}
              </button>
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Resultados
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Imágenes generadas
              </h2>

              {generatedImages.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Aún no hay imágenes generadas para este request.
                </p>
              ) : (
                <div className="mt-5 grid gap-4">
                  {generatedImages.map((image) => (
                    <div
                      key={image.id}
                      className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4"
                    >
                      <img
                        src={image.imageUrl}
                        alt="Imagen generada"
                        className="w-full rounded-2xl border border-zinc-200"
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            Generada
                          </p>
                          <p className="text-xs text-zinc-500">
                            Ejecutado con: {image.executedModel}
                          </p>
                        </div>
                        <a
                          href={image.imageUrl}
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
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

type ImageItem = {
  id: string;
  imageUrl: string;
  reasons: string[];
  avoidNotes: string;
  improveNotes: string;
};

type RequestInfo = {
  clientId?: string;
  brandBrainSnapshot?: {
    dos?: string[];
    donts?: string[];
    [key: string]: unknown;
  };
};

const reasonOptions = [
  "Texto ilegible",
  "Logo incorrecto",
  "Muy saturado",
  "No respetó la marca",
  "Composición débil",
  "Imagen principal mala",
  "Colores incorrectos",
  "Se ve genérico",
];

function cleanUnique(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

export default function RequestFeedbackWidget() {
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId;

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [avoidNotes, setAvoidNotes] = useState("");
  const [improveNotes, setImproveNotes] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    loadImages();
  }, [isOpen, requestId]);

  async function loadImages() {
    setIsLoading(true);
    setMessage("");

    try {
      const snapshot = await getDocs(
        query(collection(db, "generatedImages"), where("requestId", "==", requestId)),
      );

      const loadedImages = snapshot.docs
        .map((imageDocument) => {
          const data = imageDocument.data();

          return {
            id: imageDocument.id,
            imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
            reasons: Array.isArray(data.avoidReasons) ? data.avoidReasons : [],
            avoidNotes: typeof data.avoidNotes === "string" ? data.avoidNotes : "",
            improveNotes:
              typeof data.improveNotes === "string"
                ? data.improveNotes
                : typeof data.improvementNotes === "string"
                  ? data.improvementNotes
                  : "",
          } satisfies ImageItem;
        })
        .filter((image) => image.imageUrl);

      setImages(loadedImages);

      if (!selectedImageId && loadedImages.length > 0) {
        const firstImage = loadedImages[0];
        setSelectedImageId(firstImage.id);
        setReasons(firstImage.reasons);
        setAvoidNotes(firstImage.avoidNotes);
        setImproveNotes(firstImage.improveNotes);
      }
    } catch (error) {
      console.error(error);
      setMessage("No pudimos cargar las imágenes generadas.");
    } finally {
      setIsLoading(false);
    }
  }

  function selectImage(image: ImageItem) {
    setSelectedImageId(image.id);
    setReasons(image.reasons);
    setAvoidNotes(image.avoidNotes);
    setImproveNotes(image.improveNotes);
    setMessage("");
  }

  function toggleReason(reason: string) {
    setReasons((currentReasons) =>
      currentReasons.includes(reason)
        ? currentReasons.filter((currentReason) => currentReason !== reason)
        : [...currentReasons, reason],
    );
  }

  async function handleSave() {
    if (!selectedImageId) {
      setMessage("Selecciona una imagen.");
      return;
    }

    if (!reasons.length && !avoidNotes.trim() && !improveNotes.trim()) {
      setMessage("Agrega al menos una razón o comentario.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const requestRef = doc(db, "generationRequests", requestId);
      const requestSnapshot = await getDoc(requestRef);
      const requestData = requestSnapshot.exists()
        ? (requestSnapshot.data() as RequestInfo)
        : null;

      const currentBrain = requestData?.brandBrainSnapshot || {};

      const newDonts = cleanUnique([
        ...(currentBrain.donts || []),
        ...reasons.map((reason) => `Evitar: ${reason}`),
        avoidNotes.trim() ? `Evitar: ${avoidNotes.trim()}` : "",
      ]);

      const newDos = cleanUnique([
        ...(currentBrain.dos || []),
        improveNotes.trim() ? `Preferir: ${improveNotes.trim()}` : "",
      ]);

      await updateDoc(doc(db, "generatedImages", selectedImageId), {
        liked: false,
        feedback: "needs_work",
        avoidReasons: reasons,
        avoidNotes: avoidNotes.trim(),
        improvementNotes: improveNotes.trim(),
        feedbackUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (requestSnapshot.exists()) {
        await updateDoc(requestRef, {
          brandBrainSnapshot: {
            ...currentBrain,
            dos: newDos,
            donts: newDonts,
          },
          updatedAt: serverTimestamp(),
        });
      }

      if (requestData?.clientId) {
        const clientRef = doc(db, "clients", requestData.clientId);
        const clientSnapshot = await getDoc(clientRef);
        const clientData = clientSnapshot.exists() ? clientSnapshot.data() : null;

        const brandBrain = (clientData?.brandBrain || {}) as {
          dos?: string[];
          donts?: string[];
          [key: string]: unknown;
        };

        await updateDoc(clientRef, {
          brandBrain: {
            ...brandBrain,
            dos: cleanUnique([...(brandBrain.dos || []), ...newDos]),
            donts: cleanUnique([...(brandBrain.donts || []), ...newDonts]),
          },
          updatedAt: serverTimestamp(),
        });
      }

      setMessage(
        "Feedback guardado. Se agregó al aprendizaje del request y del cliente. Recarga antes de generar otra variante para ver el prompt actualizado.",
      );

      await loadImages();
    } catch (error) {
      console.error(error);
      setMessage("No pudimos guardar el feedback.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedImage = images.find((image) => image.id === selectedImageId);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-red-700"
      >
        👎 Feedback IA
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default"
          />

          <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <header className="bg-zinc-950 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Aprendizaje del generador
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Feedback de imagen
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Marca qué no funcionó para usarlo como regla en próximas generaciones.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full border border-white/10 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Cerrar
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {isLoading ? (
                <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                  Cargando imágenes...
                </p>
              ) : images.length === 0 ? (
                <p className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                  Este request todavía no tiene imágenes generadas.
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    {images.map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => selectImage(image)}
                        className={`overflow-hidden rounded-2xl border bg-zinc-50 p-1 ${
                          selectedImageId === image.id
                            ? "border-zinc-950"
                            : "border-zinc-200"
                        }`}
                      >
                        <img
                          src={image.imageUrl}
                          alt="Imagen generada"
                          className="aspect-square w-full rounded-xl object-cover"
                        />
                      </button>
                    ))}
                  </div>

                  {selectedImage ? (
                    <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-sm font-semibold text-zinc-950">
                        Imagen seleccionada
                      </p>
                      <img
                        src={selectedImage.imageUrl}
                        alt="Imagen seleccionada"
                        className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white"
                      />
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-3 text-sm font-semibold text-zinc-900">
                      ¿Qué debe evitarse?
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {reasonOptions.map((reason) => {
                        const selected = reasons.includes(reason);

                        return (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => toggleReason(reason)}
                            className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                              selected
                                ? "border-red-600 bg-red-600 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                            }`}
                          >
                            {reason}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-800">
                      Qué evitar en próximas generaciones
                    </label>
                    <textarea
                      value={avoidNotes}
                      onChange={(event) => setAvoidNotes(event.target.value)}
                      placeholder="Ej. Evitar fondos demasiado cargados y exceso de elementos decorativos."
                      className="min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-950"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-800">
                      Qué te hubiera gustado ver
                    </label>
                    <textarea
                      value={improveNotes}
                      onChange={(event) => setImproveNotes(event.target.value)}
                      placeholder="Ej. Algo más limpio, con mejor jerarquía y más protagonismo del producto."
                      className="min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-950"
                    />
                  </div>

                  {message ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
                      {message}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSaving
                      ? "Guardando feedback..."
                      : "Guardar feedback y aprendizaje"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
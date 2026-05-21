"use client";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

type BrandBrainForm = {
  brandDescription: string;
  tone: string;
  colors: string;
  typography: string;
  visualStyle: string;
  dos: string;
  donts: string;
  recommendedModels: string[];
};

type ClientData = {
  name: string;
  industry: string;
  status?: string;
  brandBrain?: {
    brandDescription?: string;
    tone?: string;
    colors?: string[];
    typography?: string;
    visualStyle?: string[];
    dos?: string[];
    donts?: string[];
    recommendedModels?: string[];
  };
};

const availableModels = [
  { id: "draft-mini-low", label: "Borrador económico · GPT Image Mini" },
  { id: "nano-banana", label: "Calidad para redes · Nano Banana" },
  { id: "gpt-image", label: "GPT Image estándar" },
];

function joinItems(items?: string[]) {
  return Array.isArray(items) ? items.join(", ") : "";
}

function splitCommaSeparated(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLineSeparated(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ClientBrandBrainPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const clientId = params.clientId;

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientIndustry, setClientIndustry] = useState("");
  const [editableClientName, setEditableClientName] = useState("");
  const [editableClientIndustry, setEditableClientIndustry] = useState("");
  const [clientStatus, setClientStatus] = useState("active");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<BrandBrainForm>({
    brandDescription: "",
    tone: "",
    colors: "",
    typography: "",
    visualStyle: "",
    dos: "",
    donts: "",
    recommendedModels: [],
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
      await loadClient();
    });

    return () => unsubscribe();
  }, [clientId, router]);

  async function loadClient() {
    setIsLoading(true);
    setError("");

    try {
      const clientRef = doc(db, "clients", clientId);
      const snapshot = await getDoc(clientRef);

      if (!snapshot.exists()) {
        setError("No encontramos este cliente.");
        return;
      }

      const data = snapshot.data() as ClientData;
      const brandBrain = data.brandBrain ?? {};
      const loadedName = data.name || "Cliente sin nombre";
      const loadedIndustry = data.industry || "";

      setClientName(loadedName);
      setClientIndustry(loadedIndustry || "Sin categoría definida");
      setEditableClientName(loadedName);
      setEditableClientIndustry(loadedIndustry);
      setClientStatus(data.status || "active");
      setForm({
        brandDescription: brandBrain.brandDescription ?? "",
        tone: brandBrain.tone ?? "",
        colors: joinItems(brandBrain.colors),
        typography: brandBrain.typography ?? "",
        visualStyle: joinItems(brandBrain.visualStyle),
        dos: Array.isArray(brandBrain.dos) ? brandBrain.dos.join("\n") : "",
        donts: Array.isArray(brandBrain.donts) ? brandBrain.donts.join("\n") : "",
        recommendedModels: Array.isArray(brandBrain.recommendedModels)
          ? brandBrain.recommendedModels
          : [],
      });
    } catch (loadError) {
      console.error(loadError);
      setError(
        "No pudimos cargar el Brand Brain. Revisa Firestore y vuelve a intentarlo.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateField<K extends keyof BrandBrainForm>(
    field: K,
    value: BrandBrainForm[K],
  ) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function toggleModel(modelId: string) {
    setForm((currentForm) => {
      const alreadySelected = currentForm.recommendedModels.includes(modelId);

      return {
        ...currentForm,
        recommendedModels: alreadySelected
          ? currentForm.recommendedModels.filter((model) => model !== modelId)
          : [...currentForm.recommendedModels, modelId],
      };
    });
  }

  async function handleSaveClientInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanName = editableClientName.trim();
    const cleanIndustry = editableClientIndustry.trim();

    if (!cleanName) {
      setError("El cliente debe tener nombre.");
      return;
    }

    setIsSavingClient(true);

    try {
      await updateDoc(doc(db, "clients", clientId), {
        name: cleanName,
        industry: cleanIndustry,
        updatedAt: serverTimestamp(),
      });

      setClientName(cleanName);
      setClientIndustry(cleanIndustry || "Sin categoría definida");
      setSuccess("Ficha del cliente actualizada correctamente.");
    } catch (saveError) {
      console.error(saveError);
      setError("No pudimos actualizar la ficha del cliente.");
    } finally {
      setIsSavingClient(false);
    }
  }

  async function handleArchiveClient() {
    setError("");
    setSuccess("");

    if (deleteConfirmation.trim() !== clientName.trim()) {
      setError(`Para eliminar este cliente, escribe exactamente: ${clientName}`);
      return;
    }

    setIsArchiving(true);

    try {
      await updateDoc(doc(db, "clients", clientId), {
        status: "deleted",
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace("/dashboard/clientes");
    } catch (archiveError) {
      console.error(archiveError);
      setError("No pudimos eliminar este cliente.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      await updateDoc(doc(db, "clients", clientId), {
        brandBrain: {
          brandDescription: form.brandDescription.trim(),
          tone: form.tone.trim(),
          colors: splitCommaSeparated(form.colors),
          typography: form.typography.trim(),
          visualStyle: splitCommaSeparated(form.visualStyle),
          dos: splitLineSeparated(form.dos),
          donts: splitLineSeparated(form.donts),
          recommendedModels: form.recommendedModels,
        },
        updatedAt: serverTimestamp(),
      });

      setSuccess("Brand Brain guardado correctamente.");
    } catch (saveError) {
      console.error(saveError);
      setError(
        "No pudimos guardar la información. Revisa Firestore y vuelve a intentarlo.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const completeness = useMemo(() => {
    const fields = [
      form.brandDescription,
      form.tone,
      form.colors,
      form.typography,
      form.visualStyle,
      form.dos,
      form.donts,
    ];

    const completed = fields.filter((field) => field.trim().length > 0).length;
    return Math.round((completed / fields.length) * 100);
  }, [form]);

  const canArchiveClient = deleteConfirmation.trim() === clientName.trim();

  if (isCheckingSession || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] px-6 py-5 text-sm text-zinc-200">
          Cargando Brand Brain...
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
                href="/dashboard/clientes"
                className="mb-5 inline-flex text-sm font-medium text-zinc-300 transition hover:text-white"
              >
                ← Volver a clientes
              </Link>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Brand Brain
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {clientName}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                {clientIndustry}. Esta información será el contexto base que leerá BUST IT NOW antes de generar piezas para esta marca.
              </p>
              {clientStatus !== "active" ? (
                <p className="mt-3 inline-flex rounded-full bg-red-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                  Cliente inactivo
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="min-w-48 rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-medium text-zinc-300">Completitud inicial</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
                  {completeness}%
                </p>
              </div>
              <Link
                href={`/dashboard/clientes/${clientId}/assets`}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/15 bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
              >
                Abrir Assets
              </Link>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]" onSubmit={handleSave}>
          <section className="space-y-6 rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Identidad estratégica
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Cómo debe verse y sentirse la marca
              </h2>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-800" htmlFor="brand-description">
                Descripción de marca
              </label>
              <textarea
                id="brand-description"
                value={form.brandDescription}
                onChange={(event) => updateField("brandDescription", event.target.value)}
                placeholder="Ej. Marca industrial y comercial enfocada en promociones claras, productos de acero y comunicación directa."
                className="min-h-32 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="tone">
                  Tono de la marca
                </label>
                <input
                  id="tone"
                  value={form.tone}
                  onChange={(event) => updateField("tone", event.target.value)}
                  placeholder="Ej. Directo, comercial, enérgico"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="typography">
                  Tipografías o estilo tipográfico
                </label>
                <input
                  id="typography"
                  value={form.typography}
                  onChange={(event) => updateField("typography", event.target.value)}
                  placeholder="Ej. Anton para titulares, Montserrat para apoyo"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="colors">
                  Colores de marca
                </label>
                <input
                  id="colors"
                  value={form.colors}
                  onChange={(event) => updateField("colors", event.target.value)}
                  placeholder="#003B71, #E31E24, #FFD200"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
                <p className="text-xs leading-5 text-zinc-500">Separados por coma.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="visual-style">
                  Estilo visual
                </label>
                <input
                  id="visual-style"
                  value={form.visualStyle}
                  onChange={(event) => updateField("visualStyle", event.target.value)}
                  placeholder="Industrial, alto contraste, promocional"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
                <p className="text-xs leading-5 text-zinc-500">Separado por coma.</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="dos">
                  Qué sí debe hacer
                </label>
                <textarea
                  id="dos"
                  value={form.dos}
                  onChange={(event) => updateField("dos", event.target.value)}
                  placeholder={"Mostrar el producto con jerarquía\nUsar ofertas claras\nMantener lectura rápida"}
                  className="min-h-36 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
                <p className="text-xs leading-5 text-zinc-500">Una regla por línea.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="donts">
                  Qué no debe hacer
                </label>
                <textarea
                  id="donts"
                  value={form.donts}
                  onChange={(event) => updateField("donts", event.target.value)}
                  placeholder={"No usar fondos pastel\nNo esconder precio\nNo verse minimalista premium"}
                  className="min-h-36 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                />
                <p className="text-xs leading-5 text-zinc-500">Una regla por línea.</p>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Ficha del cliente
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Editar datos base
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Estos datos se usan para identificar al cliente dentro del generador.
              </p>

              <form className="mt-5 space-y-4" onSubmit={handleSaveClientInfo}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800" htmlFor="client-name">
                    Nombre del cliente
                  </label>
                  <input
                    id="client-name"
                    value={editableClientName}
                    onChange={(event) => setEditableClientName(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800" htmlFor="client-industry">
                    Giro o categoría
                  </label>
                  <input
                    id="client-industry"
                    value={editableClientIndustry}
                    onChange={(event) => setEditableClientIndustry(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSavingClient}
                  className="flex h-12 w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSavingClient ? "Guardando ficha..." : "Guardar ficha"}
                </button>
              </form>
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Modelos recomendados
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Qué IA suele convenir
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Esto servirá después para que el sistema sugiera el generador adecuado por marca.
              </p>

              <div className="mt-6 grid gap-3">
                {availableModels.map((model) => {
                  const selected = form.recommendedModels.includes(model.id);

                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => toggleModel(model.id)}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                        selected
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-white"
                      }`}
                    >
                      <span>{model.label}</span>
                      <span>{selected ? "Seleccionado" : "Agregar"}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Guardar
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Memoria base del cliente
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Esta es la capa de información que BUST IT NOW leerá automáticamente cuando selecciones esta marca.
              </p>

              {success ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? "Guardando..." : "Guardar Brand Brain"}
              </button>
            </section>

            <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">
                Zona de riesgo
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-red-950">
                Eliminar cliente
              </h2>
              <p className="mt-2 text-sm leading-6 text-red-700">
                Para evitar errores, esto no borra físicamente la información. El cliente queda marcado como eliminado y deja de aparecer en la operación normal.
              </p>
              <p className="mt-4 text-sm font-semibold text-red-950">
                Escribe exactamente: {clientName}
              </p>
              <input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={clientName}
                className="mt-3 h-12 w-full rounded-2xl border border-red-200 bg-white px-4 text-base outline-none transition focus:border-red-500"
              />
              <button
                type="button"
                onClick={handleArchiveClient}
                disabled={!canArchiveClient || isArchiving}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isArchiving ? "Eliminando..." : "Eliminar cliente"}
              </button>
            </section>
          </aside>
        </form>
      </div>
    </main>
  );
}

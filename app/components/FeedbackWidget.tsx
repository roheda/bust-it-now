"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { FormEvent, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";

type FeedbackItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  pagePath?: string;
  createdByEmail?: string;
  createdAtText?: string;
};

const typeOptions = [
  { id: "bug", label: "Error" },
  { id: "improvement", label: "Mejora" },
  { id: "idea", label: "Idea" },
  { id: "design", label: "Diseño / UX" },
];

const priorityOptions = [
  { id: "low", label: "Baja" },
  { id: "medium", label: "Media" },
  { id: "high", label: "Alta" },
];

function typeLabel(type: string) {
  return typeOptions.find((option) => option.id === type)?.label ?? type;
}

function priorityLabel(priority: string) {
  return priorityOptions.find((option) => option.id === priority)?.label ?? priority;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    open: "Abierto",
    reviewing: "Revisando",
    planned: "Planeado",
    done: "Resuelto",
  };

  return map[status] ?? status;
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const timestamp = value as { toDate?: () => Date };
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : null;

  if (!date) return "";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function FeedbackWidget() {
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [type, setType] = useState("bug");
  const [priority, setPriority] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadFeedbackItems();
  }, [isOpen]);

  async function loadFeedbackItems() {
    setIsLoadingItems(true);

    try {
      const snapshot = await getDocs(
        query(collection(db, "platformFeedback"), orderBy("createdAt", "desc"), limit(20)),
      );

      const loadedItems = snapshot.docs.map((document) => {
        const data = document.data();

        return {
          id: document.id,
          type: typeof data.type === "string" ? data.type : "idea",
          title: typeof data.title === "string" ? data.title : "Sin título",
          description: typeof data.description === "string" ? data.description : "",
          status: typeof data.status === "string" ? data.status : "open",
          priority: typeof data.priority === "string" ? data.priority : "medium",
          pagePath: typeof data.pagePath === "string" ? data.pagePath : "",
          createdByEmail:
            typeof data.createdByEmail === "string" ? data.createdByEmail : "",
          createdAtText: formatDate(data.createdAt),
        } satisfies FeedbackItem;
      });

      setItems(loadedItems);
    } catch (loadError) {
      console.error(loadError);
    } finally {
      setIsLoadingItems(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (!cleanTitle) {
      setError("Ponle un título corto al reporte.");
      return;
    }

    if (!cleanDescription) {
      setError("Describe qué pasó o qué mejorarías.");
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "platformFeedback"), {
        type,
        priority,
        title: cleanTitle,
        description: cleanDescription,
        status: "open",
        pagePath: typeof window !== "undefined" ? window.location.pathname : "",
        pageUrl: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        createdByUid: user?.uid ?? null,
        createdByEmail: user?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTitle("");
      setDescription("");
      setType("bug");
      setPriority("medium");
      setSuccess("Reporte guardado. Gracias, esto ayuda a mejorar la plataforma.");
      await loadFeedbackItems();
    } catch (submitError) {
      console.error(submitError);
      setError("No se pudo guardar el reporte. Revisa permisos de Firestore.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-2xl bg-zinc-950 px-3 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-xl transition hover:bg-zinc-800"
      >
        Feedback
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Cerrar feedback"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default"
          />

          <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <header className="border-b border-zinc-200 bg-zinc-950 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Log de mejoras
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Reportar error o mejora
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Para que el equipo pueda ir perfeccionando BUST IT NOW durante la prueba.
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
              <form className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={handleSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-800">Tipo</label>
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-950"
                    >
                      {typeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-800">Prioridad</label>
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-950"
                    >
                      {priorityOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Título corto</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ej. El logo aparece como texto"
                    className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-950"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-800">Descripción</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Qué pasó, en qué pantalla, qué esperabas que pasara o qué mejorarías."
                    className="min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-950"
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
                  disabled={isSubmitting}
                  className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Guardando..." : "Guardar reporte"}
                </button>
              </form>

              <section className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Reportes recientes
                    </p>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
                      Pendientes y mejoras
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={loadFeedbackItems}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                  >
                    Actualizar
                  </button>
                </div>

                {isLoadingItems ? (
                  <p className="mt-4 rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                    Cargando reportes...
                  </p>
                ) : items.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                    Todavía no hay reportes. El primero ayudará a mejorar la plataforma.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {items.map((item) => (
                      <article key={item.id} className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                            {typeLabel(item.type)}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-700">
                            {priorityLabel(item.priority)}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                            {statusLabel(item.status)}
                          </span>
                        </div>
                        <h4 className="mt-3 text-base font-semibold text-zinc-950">{item.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-zinc-600">{item.description}</p>
                        <p className="mt-3 text-xs leading-5 text-zinc-500">
                          {item.pagePath ? `Pantalla: ${item.pagePath}` : ""}
                          {item.createdAtText ? ` · ${item.createdAtText}` : ""}
                          {item.createdByEmail ? ` · ${item.createdByEmail}` : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

type ClientRecord = {
  id: string;
  name: string;
  industry?: string;
  status?: string;
};

type BriefRecord = {
  id: string;
  clientId?: string;
  clientName: string;
  mainMessage: string;
  status: string;
  format: string;
  contentType: string;
  createdAtMs: number;
  generatedAtMs: number;
  previewImageUrl?: string;
};

type GeneratedImageRecord = {
  requestId: string;
  imageUrl: string;
  createdAtMs: number;
  isFinal: boolean;
};

function timestampToMs(value: unknown) {
  if (!value || typeof value !== "object") return 0;

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate !== "function") return 0;

  return timestamp.toDate().getTime();
}

function formatDate(ms: number) {
  if (!ms) return "Sin fecha";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
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

export default function BriefHistoryPage() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [briefs, setBriefs] = useState<BriefRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
      await loadHistory();
    });

    return () => unsubscribe();
  }, [router]);

  async function loadHistory() {
    setIsLoading(true);
    setError("");

    try {
      const [clientsSnapshot, requestsSnapshot, imagesSnapshot] = await Promise.all([
        getDocs(query(collection(db, "clients"))),
        getDocs(query(collection(db, "generationRequests"))),
        getDocs(query(collection(db, "generatedImages"))),
      ]);

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

      const generatedImages = imagesSnapshot.docs.map((imageDocument) => {
        const data = imageDocument.data();

        return {
          requestId: typeof data.requestId === "string" ? data.requestId : "",
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
          createdAtMs: timestampToMs(data.createdAt),
          isFinal: data.isFinal === true,
        } satisfies GeneratedImageRecord;
      });

      const latestImageByRequest = new Map<string, GeneratedImageRecord>();

      generatedImages.forEach((image) => {
        if (!image.requestId || !image.imageUrl) return;

        const currentImage = latestImageByRequest.get(image.requestId);
        const imageScore = (image.isFinal ? 10_000_000_000_000 : 0) + image.createdAtMs;
        const currentScore = currentImage
          ? (currentImage.isFinal ? 10_000_000_000_000 : 0) + currentImage.createdAtMs
          : -1;

        if (!currentImage || imageScore > currentScore) {
          latestImageByRequest.set(image.requestId, image);
        }
      });

      const loadedBriefs = requestsSnapshot.docs.map((requestDocument) => {
        const data = requestDocument.data();
        const latestImage = latestImageByRequest.get(requestDocument.id);
        const createdAtMs = timestampToMs(data.createdAt);
        const generatedAtMs = latestImage?.createdAtMs || createdAtMs;

        return {
          id: requestDocument.id,
          clientId: typeof data.clientId === "string" ? data.clientId : "",
          clientName: typeof data.clientName === "string" ? data.clientName : "Cliente",
          mainMessage:
            typeof data.mainMessage === "string" ? data.mainMessage : "Sin mensaje principal",
          status: typeof data.status === "string" ? data.status : "brief_ready",
          format: typeof data.format === "string" ? data.format : "",
          contentType: typeof data.contentType === "string" ? data.contentType : "",
          createdAtMs,
          generatedAtMs,
          previewImageUrl: latestImage?.imageUrl,
        } satisfies BriefRecord;
      });

      loadedBriefs.sort((a, b) => b.generatedAtMs - a.generatedAtMs);

      setClients(loadedClients);
      setBriefs(loadedBriefs);
    } catch (loadError) {
      console.error(loadError);
      setError("No pudimos cargar el historial de briefs.");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredBriefs = useMemo(() => {
    if (selectedClientId === "all") return briefs;
    return briefs.filter((brief) => brief.clientId === selectedClientId);
  }, [briefs, selectedClientId]);

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
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Historial de briefs
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Últimas generaciones
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Revisa las piezas generadas, filtra por cliente y reutiliza briefs aprobados sin volver a llenar todo desde cero.
              </p>
            </div>

            <button
              type="button"
              onClick={loadHistory}
              className="h-12 rounded-2xl border border-white/15 bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
            >
              Actualizar historial
            </button>
          </div>
        </header>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Filtro
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Buscar por cliente
              </h2>
            </div>

            <select
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
              className="h-12 min-w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white lg:min-w-80"
            >
              <option value="all">Todos los clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-5 text-sm text-zinc-600">
              Cargando historial...
            </div>
          ) : filteredBriefs.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm leading-6 text-zinc-600">
              No hay briefs para este filtro.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredBriefs.map((brief) => (
                <article
                  key={brief.id}
                  className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:shadow-zinc-200/70"
                >
                  <Link href={`/dashboard/generador/${brief.id}`} className="block">
                    <div className="aspect-[4/5] bg-zinc-200">
                      {brief.previewImageUrl ? (
                        <img
                          src={brief.previewImageUrl}
                          alt={`Imagen generada para ${brief.clientName}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm font-medium text-zinc-500">
                          Sin imagen generada todavía
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          {brief.clientName}
                        </p>
                        <h3 className="mt-2 line-clamp-3 text-lg font-semibold leading-6 text-zinc-950">
                          {brief.mainMessage}
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                        {formatStatus(brief.status)}
                      </span>
                    </div>

                    <p className="text-xs leading-5 text-zinc-500">
                      Último movimiento: {formatDate(brief.generatedAtMs)}
                      <br />
                      {brief.format || "Formato"} · {brief.contentType || "Contenido"}
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Link
                        href={`/dashboard/generador/${brief.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                      >
                        Abrir
                      </Link>
                      <Link
                        href={`/dashboard/generador/editar/${brief.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
                      >
                        Reusar / editar
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

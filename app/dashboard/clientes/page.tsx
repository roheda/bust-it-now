"use client";

import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

type ClientRecord = {
  id: string;
  name: string;
  industry?: string;
  status?: string;
};

export default function ClientsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");

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
      const clientsQuery = query(collection(db, "clients"));
      const snapshot = await getDocs(clientsQuery);
      const loadedClients = snapshot.docs
        .map((document) => {
          const data = document.data();

          return {
            id: document.id,
            name: typeof data.name === "string" ? data.name : "Cliente sin nombre",
            industry: typeof data.industry === "string" ? data.industry : "",
            status: typeof data.status === "string" ? data.status : "active",
          } satisfies ClientRecord;
        })
        .filter((client) => client.status !== "deleted");

      loadedClients.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setClients(loadedClients);
    } catch (loadError) {
      console.error(loadError);
      setError(
        "No pudimos cargar clientes. Revisa que Firestore esté activo y que las reglas permitan acceso a usuarios autenticados.",
      );
    } finally {
      setIsLoadingClients(false);
    }
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanName = name.trim();
    const cleanIndustry = industry.trim();

    if (!cleanName) {
      setError("Escribe el nombre del cliente.");
      return;
    }

    setIsSaving(true);

    try {
      const clientRef = await addDoc(collection(db, "clients"), {
        name: cleanName,
        industry: cleanIndustry,
        status: "active",
        brandBrain: {
          brandDescription: "",
          tone: "",
          colors: [],
          typography: "",
          visualStyle: [],
          dos: [],
          donts: [],
          recommendedModels: [],
        },
        createdBy: user?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newClient = {
        id: clientRef.id,
        name: cleanName,
        industry: cleanIndustry,
        status: "active",
      } satisfies ClientRecord;

      setClients((currentClients) =>
        [...currentClients, newClient].sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        ),
      );
      setName("");
      setIndustry("");
      setSuccess("Cliente creado. Ya puedes configurar su Brand Brain.");
    } catch (saveError) {
      console.error(saveError);
      setError(
        "No pudimos crear el cliente. Revisa Firestore y vuelve a intentarlo.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const clientCountLabel = useMemo(() => {
    if (clients.length === 1) return "1 cliente activo";
    return `${clients.length} clientes activos`;
  }, [clients.length]);

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
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
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
                Clientes
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Crea cada marca una sola vez. Después configuraremos su Brand Brain para que el generador lea automáticamente la identidad visual de ese cliente.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-zinc-100">
              {clientCountLabel}
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <article className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Nuevo cliente
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Alta de marca
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Por ahora guardamos la ficha base. En el siguiente paso llenaremos su memoria visual.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleCreateClient}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="client-name">
                  Nombre del cliente
                </label>
                <input
                  id="client-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Acerofertas"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-800" htmlFor="client-industry">
                  Giro o categoría
                </label>
                <input
                  id="client-industry"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Ej. Acero, restaurante, inmobiliaria"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
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
                disabled={isSaving}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? "Creando cliente..." : "Crear cliente"}
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Marcas almacenadas
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Configura su Brand Brain
                </h2>
              </div>
              <button
                type="button"
                onClick={loadClients}
                className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
              >
                Actualizar
              </button>
            </div>

            {isLoadingClients ? (
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-6 text-sm text-zinc-600">
                Cargando clientes...
              </div>
            ) : clients.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm leading-6 text-zinc-600">
                Todavía no hay clientes activos. Crea el primero para empezar a construir su memoria visual.
              </div>
            ) : (
              <div className="grid gap-4">
                {clients.map((client) => (
                  <Link
                    key={client.id}
                    href={`/dashboard/clientes/${client.id}`}
                    className="group rounded-3xl border border-zinc-200 bg-zinc-50 p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:shadow-lg hover:shadow-zinc-200/70"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-lg font-semibold tracking-tight text-zinc-950">
                          {client.name}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          {client.industry || "Sin categoría definida"}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                        Abrir
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

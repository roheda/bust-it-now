"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
      setIsCheckingSession(false);
    });

    return () => unsubscribe();
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login");
  }

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
        <header className="flex flex-col justify-between gap-4 rounded-[2rem] bg-zinc-950 p-6 text-white shadow-xl shadow-zinc-300/60 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
              BUST IT NOW
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Dashboard inicial
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Sesión activa: {user?.email ?? "usuario sin correo"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="h-12 rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Cerrar sesión
          </button>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          {[
            {
              title: "Clientes",
              description:
                "Alta y administración de marcas que usarán la plataforma.",
              status: "Siguiente módulo",
            },
            {
              title: "Brand Brain",
              description:
                "Memoria visual: logos, colores, referencias y reglas por cliente.",
              status: "Siguiente módulo",
            },
            {
              title: "Generador",
              description:
                "Brief guiado y selección de modelo de IA para crear piezas.",
              status: "Próximamente",
            },
          ].map((card) => (
            <article
              key={card.title}
              className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-6 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                {card.status}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {card.description}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Primer checkpoint completado
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                Ya tenemos la base de acceso del sistema. El siguiente bloque será construir el panel de clientes y el Brand Brain para empezar a guardar la memoria visual de cada marca.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Ver acceso
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

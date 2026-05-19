"use client";

import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/dashboard");
    } catch {
      setError("No pudimos iniciar sesión. Revisa tu correo y contraseña.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200">
            BUST IT NOW
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Generación visual inteligente para marcas.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-zinc-300">
              Accede al panel para administrar clientes, construir su Brand Brain y generar piezas visuales con la identidad de cada marca.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Brand Brain por cliente",
              "Briefs claros y guiados",
              "Modelos de IA seleccionables",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-200"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white p-6 text-zinc-950 shadow-2xl shadow-black/30 sm:p-8">
          <div className="mb-8 space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Acceso
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">Iniciar sesión</h2>
            <p className="text-sm leading-6 text-zinc-600">
              Entra con el usuario creado en Firebase Authentication.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-800" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-800" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none transition focus:border-zinc-950 focus:bg-white"
                required
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? "Entrando..." : "Entrar a BUST IT NOW"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

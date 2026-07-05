"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setErrorText("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setErrorText("Enter your email and password.");
      return;
    }

    if (password.length < 8) {
      setErrorText("Use a password with at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (error) {
          setErrorText(error.message);
          return;
        }

        router.replace("/chat");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/chat`
              : undefined
        }
      });

      if (error) {
        setErrorText(error.message);
        return;
      }

      setMessage("Account created. Check your email if confirmation is required, then sign in.");
      setMode("signin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#06110f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,168,132,0.22),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(79,70,229,0.18),transparent_34%)]" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden flex-col justify-between bg-[#0b1f1a] p-10 md:flex">
            <div>
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00a884] text-3xl shadow-lg">
                🕊️
              </div>

              <h1 className="max-w-lg text-5xl font-semibold tracking-tight">
                PigeonProject
              </h1>

              <p className="mt-5 max-w-md text-lg leading-8 text-white/72">
                Private messaging with saved encrypted conversations, direct chats, group chats, emoji support, and browser-based calling.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <strong className="block text-white">Encrypted storage</strong>
                Messages are stored as encrypted data, not normal readable text.
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <strong className="block text-white">Public access</strong>
                Users can sign in from the web and see saved messages after logging in.
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <strong className="block text-white">Security note</strong>
                Keep your password private. Do not share sensitive data until full E2EE key management is finished.
              </div>
            </div>
          </div>

          <div className="bg-[#111716] p-6 sm:p-10">
            <div className="mx-auto flex max-w-md flex-col justify-center py-4 md:min-h-[640px]">
              <div className="mb-8 md:hidden">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00a884] text-2xl">
                  🕊️
                </div>
                <h1 className="text-3xl font-semibold">PigeonProject</h1>
              </div>

              <div className="mb-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-[#00a884]">
                  Secure messaging
                </p>

                <h2 className="text-3xl font-semibold">
                  {mode === "signin" ? "Welcome back" : "Create your account"}
                </h2>

                <p className="mt-3 text-sm leading-6 text-white/60">
                  {mode === "signin"
                    ? "Sign in to open your saved conversations."
                    : "Create an account to start using PigeonProject."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white/80">
                    Email
                  </span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-white outline-none transition placeholder:text-white/35 focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white/80">
                    Password
                  </span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    placeholder="At least 8 characters"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-white outline-none transition placeholder:text-white/35 focus:border-[#00a884] focus:ring-4 focus:ring-[#00a884]/15"
                  />
                </label>

                {errorText && (
                  <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {errorText}
                  </div>
                )}

                {message && (
                  <div className="rounded-2xl border border-[#00a884]/30 bg-[#00a884]/10 px-4 py-3 text-sm text-emerald-100">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-2xl bg-[#00a884] font-semibold text-white shadow-lg shadow-[#00a884]/15 transition hover:bg-[#06b48f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? "Please wait..."
                    : mode === "signin"
                      ? "Sign In"
                      : "Create Account"}
                </button>
              </form>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/60">
                PigeonProject saves encrypted message data in Supabase. Full Signal-style security requires the next encryption upgrade with user-owned private keys.
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setErrorText("");
                  setMessage("");
                }}
                className="mt-6 text-sm font-medium text-[#00a884] hover:text-[#22d3b0]"
              >
                {mode === "signin"
                  ? "Need an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
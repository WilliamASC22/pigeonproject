"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { createProfile } from "@/src/lib/chat";

type AuthMode = "signin" | "signup";
type BannerType = "info" | "error";

export default function LoginPage() {
  const router = useRouter();

  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [bannerType, setBannerType] = useState<BannerType>("info");

  const isSignIn = authMode === "signin";

  const pageTitle = useMemo(() => {
    return isSignIn ? "Sign in securely" : "Create your account";
  }, [isSignIn]);

  const pageSubtitle = useMemo(() => {
    return isSignIn
      ? "Access your account, then unlock encryption to view your saved conversations."
      : "Create an account, then set up encryption before starting private conversations.";
  }, [isSignIn]);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        router.replace("/chat");
      }
    };

    checkSession();
  }, [router]);

  const showInfo = (message: string) => {
    setBannerType("info");
    setBannerText(message);
  };

  const showError = (message: string) => {
    setBannerType("error");
    setBannerText(message);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBannerText("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      showError("Enter your email address.");
      return;
    }

    if (accountPassword.length < 8) {
      showError("Use an account password with at least 8 characters.");
      return;
    }

    setBusy(true);

    try {
      if (isSignIn) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: accountPassword
        });

        if (error) {
          throw error;
        }

        if (data.user) {
          await createProfile(data.user);
        }

        router.replace("/chat");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: accountPassword
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        await createProfile(data.user);
      }

      showInfo(
        "Account created. If email confirmation is required, check your inbox before signing in."
      );

      setAuthMode("signin");
      setAccountPassword("");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#06110f] px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-7xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d1211] shadow-2xl shadow-black/50 lg:grid-cols-[1fr_0.95fr]">
          <aside className="flex flex-col bg-[#06251f] p-7 sm:p-10 lg:p-12">
            <div>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#00a884] text-4xl shadow-lg shadow-[#00a884]/20">
                🕊️
              </div>

              <p className="mt-10 text-xs font-black uppercase tracking-[0.35em] text-[#00d6aa]">
                Secure Public Messaging
              </p>

              <h1 className="mt-5 text-5xl font-black tracking-[-0.06em] sm:text-6xl">
                PigeonProject
              </h1>

              <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/70">
                A privacy-focused messaging platform for saved encrypted
                conversations, direct chats, group chats, contact requests, and
                browser-based communication.
              </p>
            </div>

            <div className="mt-10 grid gap-4">
              <InfoCard
                title="Encrypted messages"
                text="Message content is encrypted in the browser before it is saved, so the database stores encrypted message data instead of normal readable conversation text."
              />

              <InfoCard
                title="Saved conversations"
                text="Users can return later, sign in, unlock encryption, and continue their saved direct chats and group chats."
              />

              <InfoCard
                title="Private encryption unlock"
                text="PigeonProject uses a separate encryption password to help protect each user’s private encryption key."
              />
            </div>
          </aside>

          <section className="flex items-center p-7 sm:p-10 lg:p-12">
            <div className="w-full">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#00d6aa]">
                Account Access
              </p>

              <h2 className="mt-5 text-4xl font-black tracking-[-0.05em] sm:text-5xl">
                {pageTitle}
              </h2>

              <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-white/60">
                {pageSubtitle}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-bold text-white/85"
                  >
                    Email address
                  </label>

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={busy}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-base font-semibold text-white outline-none placeholder:text-white/35 focus:border-[#00d6aa] focus:ring-4 focus:ring-[#00d6aa]/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="account-password"
                    className="mb-2 block text-sm font-bold text-white/85"
                  >
                    Account password
                  </label>

                  <input
                    id="account-password"
                    type="password"
                    autoComplete={isSignIn ? "current-password" : "new-password"}
                    placeholder="Enter your account password"
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                    disabled={busy}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-base font-semibold text-white outline-none placeholder:text-white/35 focus:border-[#00d6aa] focus:ring-4 focus:ring-[#00d6aa]/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                {bannerText ? (
                  <div
                    role="status"
                    className={
                      bannerType === "error"
                        ? "rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-100"
                        : "rounded-2xl border border-[#00a884]/30 bg-[#00a884]/10 p-4 text-sm font-bold leading-6 text-emerald-100"
                    }
                  >
                    {bannerText}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 h-14 rounded-2xl bg-[#00a884] text-base font-black text-white shadow-lg shadow-[#00a884]/20 transition hover:bg-[#06b48f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy
                    ? "Please wait..."
                    : isSignIn
                      ? "Sign In"
                      : "Create Account"}
                </button>
              </form>

              <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-base font-black">Security model</h3>

                <p className="mt-3 text-sm font-semibold leading-7 text-white/65">
                  PigeonProject is designed so plaintext message content is not
                  stored in Supabase. Messages are encrypted before storage, and
                  users must unlock encryption to read saved conversations.
                </p>
              </div>

              <div className="mt-5 rounded-3xl border border-yellow-300/25 bg-yellow-300/10 p-5 text-sm font-bold leading-7 text-yellow-100">
                No public app can honestly promise that hacking is impossible.
                Keep your account password, encryption password, and device
                secure. Use an independent security audit before sensitive
                production use.
              </div>

              <button
                type="button"
                onClick={() => {
                  setBannerText("");
                  setAccountPassword("");
                  setAuthMode(isSignIn ? "signup" : "signin");
                }}
                disabled={busy}
                className="mt-7 w-full text-center text-sm font-black text-[#00d6aa] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSignIn
                  ? "Need an account? Create one"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-7 text-white/65">
        {text}
      </p>
    </article>
  );
}
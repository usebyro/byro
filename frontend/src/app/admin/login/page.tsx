"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Script from "next/script";
import { useRouter } from "next/navigation";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);

  const turnstile = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

  useEffect(() => {
    if (step !== "email" || !turnstileReady || !turnstileRef.current || !TURNSTILE_SITE_KEY) return;
    const api = turnstile();
    if (!api) return;
    widgetId.current = api.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "light",
      callback: (t: string) => setTurnstileToken(t),
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => setTurnstileToken(""),
    });
    return () => {
      if (widgetId.current !== null) turnstile()?.remove(widgetId.current);
      widgetId.current = null;
      setTurnstileToken("");
    };
  }, [step, turnstileReady]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin-auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), turnstile_token: turnstileToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Couldn't send a code. Try again.");
        if (widgetId.current !== null) turnstile()?.reset(widgetId.current);
        setTurnstileToken("");
        return;
      }
      setStep("code");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "That code didn't work. Try again.");
        return;
      }
      router.replace("/admin");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const input =
    "w-full bg-white border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";
  const button =
    "w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-bold py-3 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

  return (
    <div className="min-h-screen bg-paper font-body flex items-center justify-center px-4 py-10">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setTurnstileReady(true)}
      />
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-6">
            <Image src="/assets/images/logo.svg" alt="Byro" width={60} height={24} className="h-6 w-auto" />
            <span className="font-display text-[11px] font-bold text-white bg-ink px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">
            {step === "email" ? "Sign in to Byro Admin" : "Check your email"}
          </h1>
          <p className="text-muted text-sm mt-1.5">
            {step === "email" ? "We email you a one-time code. No password needed." : "Enter the code to finish signing in."}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="bg-white border border-line rounded-3xl p-6 md:p-7 space-y-4">
            <div>
              <label htmlFor="admin-email" className="text-sm font-bold text-ink block mb-2">Work email</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@usebyro.com"
                required
                className={input}
              />
            </div>
            <div ref={turnstileRef} className="flex justify-center" />
            {error && <p className="text-danger text-sm">{error}</p>}
            <button type="submit" disabled={loading || !email.trim() || !turnstileToken} className={button}>
              {loading ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="bg-white border border-line rounded-3xl p-6 md:p-7 space-y-4">
            <div>
              <label htmlFor="admin-code" className="text-sm font-bold text-ink block mb-2">
                Enter the code we sent to {email.trim()}
              </label>
              <input
                id="admin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                className={input}
              />
            </div>
            {error && <p className="text-danger text-sm">{error}</p>}
            <button type="submit" disabled={loading || !code.trim()} className={button}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(""); }}
              className="w-full text-sm font-bold text-muted hover:text-ink"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

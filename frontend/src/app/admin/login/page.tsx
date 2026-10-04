"use client";

import { useEffect, useRef, useState } from "react";
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
      theme: "dark",
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
    "w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const button =
    "w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors";

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setTurnstileReady(true)}
      />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-white text-2xl font-bold">Byro</h1>
          <p className="text-gray-400 text-sm mt-1">Admin access</p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 space-y-4">
            <div>
              <label htmlFor="admin-email" className="text-xs text-gray-400 block mb-2">Work email</label>
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
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading || !email.trim() || !turnstileToken} className={button}>
              {loading ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 space-y-4">
            <div>
              <label htmlFor="admin-code" className="text-xs text-gray-400 block mb-2">
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
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading || !code.trim()} className={button}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(""); }}
              className="w-full text-xs text-gray-400 hover:text-white"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

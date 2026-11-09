"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import axiosInstance from "@/utils/axios";

const BTN =
  "inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-semibold text-white " +
  "transition-[background-color,scale] duration-150 hover:bg-brand-dark active:scale-[0.96] motion-reduce:transition-none sm:w-auto sm:min-w-64 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function ConfirmEmailPage() {
  const { token } = useParams();
  const [newEmail, setNewEmail] = useState("");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get(`email-changes/${token}/`)
      .then((res) => !cancelled && setNewEmail(res.data.new_email))
      .catch((err) => {
        if (cancelled) return;
        setProblem(err.response?.data?.message || err.response?.data?.error || "We couldn't open this link. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await axiosInstance.post(`email-changes/${token}/confirm/`);
      setDone(data);
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't confirm this. Please try again.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-white font-body text-ink">
      <header className="mx-auto flex max-w-5xl items-center px-5 py-6 sm:px-8">
        <Link href="/" aria-label="Byro home">
          <Image src="/assets/images/logo.svg" alt="byro" width={80} height={32} className="h-7 w-auto" priority />
        </Link>
      </header>

      <section className="mx-auto max-w-md px-5 pb-20 pt-10 sm:px-8">
        {problem ? (
          <>
            <h1 className="font-display text-3xl font-semibold leading-tight">This link can&apos;t be used</h1>
            <p className="mt-3 text-base leading-relaxed text-muted">{problem}</p>
            <Link href="/" className={`${BTN} mt-8`}>Go to Byro</Link>
          </>
        ) : done ? (
          <>
            <h1 className="font-display text-3xl font-semibold leading-tight">Your email is updated</h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Sign in with <b className="text-ink">{done.email}</b> from now on. Your tickets, stamps and events are all still there.
            </p>
            <Link href={`/login?email=${encodeURIComponent(done.email)}`} className={`${BTN} mt-8`}>Sign in</Link>
          </>
        ) : !newEmail ? (
          <p role="status" className="text-sm text-muted">Opening your link…</p>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold leading-tight text-balance">Confirm your new email</h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Byro will use <b className="text-ink">{newEmail}</b> for your account. Your tickets, stamps, events and community stay exactly as they are.
            </p>
            {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
            <button type="button" onClick={confirm} disabled={busy} className={`${BTN} mt-8`}>
              {busy ? "Confirming…" : "Confirm this email"}
            </button>
            <p className="mt-4 text-sm text-muted">Not expecting this? Close this page and nothing changes.</p>
          </>
        )}
      </section>
    </main>
  );
}

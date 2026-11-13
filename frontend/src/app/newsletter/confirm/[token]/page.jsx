"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import API from "@/services/api";

const BTN =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-[15px] font-bold text-white " +
  "transition-[background-color,scale] duration-150 hover:bg-brand-dark active:scale-[0.97] motion-reduce:transition-none sm:w-auto " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function ConfirmNewsletterPage() {
  const { token } = useParams();
  // loading | confirmed | already | expired | invalid
  const [state, setState] = useState("loading");
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState("");
  const [resend, setResend] = useState("idle"); // idle | sending | sent | error

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Looking is separate from confirming, so a mail scanner that only fetches the link can't subscribe anyone.
        const link = await API.getNewsletterLink(token);
        if (cancelled) return;
        setEmail(link.email);
        if (link.state === "expired") return setState("expired");
        if (link.state === "confirmed") return setState("already");
        const done = await API.confirmNewsletter(token);
        if (cancelled) return;
        setEmail(done.email || link.email);
        setState(done.state === "already" ? "already" : "confirmed");
      } catch (err) {
        if (cancelled) return;
        const data = err.response?.data;
        if (data?.state === "expired") {
          setEmail(data.email || "");
          return setState("expired");
        }
        setProblem(data?.error || "We couldn't open this link. Please try again.");
        setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sendNew = async () => {
    setResend("sending");
    try {
      const data = await API.resendNewsletter(token);
      if (data?.email) setEmail(data.email);
      setResend("sent");
    } catch {
      setResend("error");
    }
  };

  const ok = state === "confirmed" || state === "already";

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDE9] font-body text-ink">
      <header className="mx-auto flex h-[72px] w-full max-w-[1120px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Byro home">
          <Image src="/assets/images/logo.svg" alt="byro" width={80} height={32} className="h-7 w-auto" priority />
        </Link>
        <div className="flex-1" />
        <Link href="/discover" className="hidden text-[15px] font-semibold text-[#3B4252] sm:block">Discover</Link>
        <Link href="/login" className="flex min-h-10 items-center rounded-full border border-line bg-white px-[18px] text-sm font-bold">Sign in</Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-20">
        <div aria-live="polite" className="flex w-full max-w-[480px] flex-col items-center gap-6 text-center">
          {state === "loading" && <p role="status" className="text-sm text-muted">Confirming your email…</p>}

          {ok && (
            <>
              <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#E9F7EF] text-[#1F7A52]">
                <HugeiconsIcon icon={Tick02Icon} size={32} color="currentColor" strokeWidth={2.2} />
              </span>
              <div className="flex flex-col items-center gap-2.5">
                <h1 className="font-display text-[clamp(34px,6vw,48px)] font-bold leading-[1.05] tracking-[-0.035em]">
                  {state === "already" ? "You’re already subscribed" : "You’re subscribed"}
                </h1>
                <p className="text-[17px] leading-[1.55] text-[#3B4252]">
                  {state === "already" ? (
                    <><b className="break-all">{email}</b> is already on the list. Nothing more to do.</>
                  ) : (
                    <>The best events near you will land in <b className="break-all">{email}</b> once a week.</>
                  )}
                </p>
              </div>
              <Link href="/discover" className={BTN}>Find events this week</Link>
              <p className="text-sm text-muted">Every email has an unsubscribe link at the bottom.</p>
            </>
          )}

          {state === "expired" && (
            <>
              <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#FFF4D6] text-[#8A5A00]">
                <HugeiconsIcon icon={Clock01Icon} size={30} color="currentColor" strokeWidth={2} />
              </span>
              <div className="flex flex-col items-center gap-2.5">
                <h1 className="font-display text-[clamp(32px,6vw,44px)] font-bold leading-[1.05] tracking-[-0.035em]">This link has expired</h1>
                <p className="text-[17px] leading-[1.55] text-[#3B4252]">Confirm links only work for a short time. We can send you a new one.</p>
              </div>
              {resend === "sent" ? (
                <p role="status" className="text-[15px] font-bold text-[#1F7A52]">New link sent to {email}. Check your inbox.</p>
              ) : (
                <>
                  <button type="button" onClick={sendNew} disabled={resend === "sending"} className={BTN}>
                    {resend === "sending" ? "Sending…" : "Send me a new link"}
                  </button>
                  {resend === "error" && <p role="alert" className="text-sm text-red-600">We couldn&apos;t send it just now. Try again in a minute.</p>}
                </>
              )}
            </>
          )}

          {state === "invalid" && (
            <>
              <h1 className="font-display text-[clamp(32px,6vw,44px)] font-bold leading-[1.05] tracking-[-0.035em]">This link can&apos;t be used</h1>
              <p className="text-[17px] leading-[1.55] text-[#3B4252]">{problem}</p>
              <Link href="/" className={BTN}>Go to Byro</Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

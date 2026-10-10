"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import API from "@/services/api";

function Unfollow() {
  const token = useSearchParams().get("t") || "";
  const [state, setState] = useState({ status: "working", name: "" });

  useEffect(() => {
    document.title = "Unfollow | Byro";
    if (!token) {
      setState({ status: "invalid", name: "" });
      return;
    }
    API.unfollowByToken(token)
      .then((r) => setState({ status: "done", name: r.name }))
      .catch(() => setState({ status: "invalid", name: "" }));
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 pt-20 md:px-8">
      {state.status === "working" && <p className="text-lg text-muted">One moment…</p>}
      {state.status === "done" && (
        <>
          <h1 className="font-display text-[40px] font-bold leading-none tracking-[-0.04em] md:text-6xl">You&apos;ve unfollowed.</h1>
          <p className="text-lg leading-relaxed text-muted">
            You won&apos;t get emails about new events from {state.name} any more. You can follow them again from their community page.
          </p>
        </>
      )}
      {state.status === "invalid" && (
        <>
          <h1 className="font-display text-[40px] font-bold leading-none tracking-[-0.04em] md:text-6xl">This link isn&apos;t valid.</h1>
          <p className="text-lg leading-relaxed text-muted">It may have been copied incompletely. Email support@usebyro.com and we&apos;ll sort it out.</p>
        </>
      )}
      <Link href="/discover" className="mt-2 flex h-[52px] items-center rounded-full bg-brand px-7 text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96]">
        Browse events
      </Link>
    </div>
  );
}

export default function UnfollowPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white font-body text-ink">
      <Navbar />
      <Suspense fallback={null}>
        <Unfollow />
      </Suspense>
      <Footer />
    </div>
  );
}

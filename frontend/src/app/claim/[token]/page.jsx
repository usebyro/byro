"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Providers } from "@/redux/Providers";
import { useAuth } from "@/redux/useAuth";
import axiosInstance from "@/utils/axios";

const dateOf = (day) =>
  day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

function ClaimScreen() {
  const { token: claimToken } = useParams();
  const router = useRouter();
  const { token: authToken, ready } = useAuth();
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  const here = `/claim/${claimToken}`;

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get(`event-claims/${claimToken}/`)
      .then((res) => !cancelled && setPreview(res.data.event))
      .catch((err) => {
        if (cancelled) return;
        setProblem(err.response?.data?.message || err.response?.data?.error || "We couldn't open this link. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [claimToken]);

  const claim = async () => {
    setClaiming(true);
    setError("");
    try {
      const { data } = await axiosInstance.post(`event-claims/${claimToken}/claim/`);
      const next = `/dashboard/events/${data.slug}`;
      // The event can't go live until their name and username are set, so do that first.
      router.replace(data.profile_complete ? next : `/onboarding-preview?redirect=${encodeURIComponent(next)}`);
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't claim this event. Please try again.");
      setClaiming(false);
    }
  };

  const when = preview ? [dateOf(preview.day), preview.location].filter(Boolean).join(" · ") : "";
  const loginHref = `/login?redirect=${encodeURIComponent(here)}`;

  const BTN =
    "inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-semibold text-white " +
    "transition-[background-color,scale] duration-150 hover:bg-brand-dark active:scale-[0.96] motion-reduce:transition-none sm:w-auto sm:min-w-64 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const STEPS = [
    ["Sign in or create an account", "Free, and it takes under a minute."],
    ["Set up your profile", "Your name and username. Guests see these on your event."],
    ["Review the event and publish", "Change anything first. Nothing is public until you publish."],
  ];

  const date = preview?.day ? new Date(`${preview.day}T00:00:00`) : null;

  return (
    <main className="min-h-screen bg-white font-body text-ink">
      <header className="mx-auto flex max-w-5xl items-center px-5 py-6 sm:px-8">
        <Link href="/" aria-label="Byro home">
          <Image src="/assets/images/logo.svg" alt="byro" width={80} height={32} className="h-7 w-auto" priority />
        </Link>
      </header>

      {problem ? (
        <section className="mx-auto max-w-md px-5 pb-20 pt-10 sm:px-8">
          <h1 className="font-display text-3xl font-semibold leading-tight">This link can&apos;t be used</h1>
          <p className="mt-3 text-base leading-relaxed text-muted">{problem}</p>
          <Link href="/" className={`${BTN} mt-8`}>
            Go to Byro
          </Link>
        </section>
      ) : !preview ? (
        <p role="status" className="mx-auto max-w-5xl px-5 pt-16 text-sm text-muted sm:px-8">
          Opening your event…
        </p>
      ) : (
        <section className="mx-auto grid max-w-5xl gap-x-16 gap-y-8 px-5 pb-20 pt-6 sm:px-8 md:grid-cols-[1fr_minmax(0,22rem)] md:gap-y-0 md:pt-14">
          <div className="md:col-start-1 md:row-start-1">
            <h1 className="font-display text-[2rem] font-semibold leading-[1.1] tracking-tight break-words text-balance sm:text-5xl">
              We set up your event.
            </h1>
            <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-muted sm:text-lg">
              Claim it to make it yours. Three steps and it&apos;s ready to share.
            </p>
          </div>

          <aside aria-label="The event" className="md:col-start-2 md:row-span-2 md:row-start-1">
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              {preview.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.image}
                  alt=""
                  className="aspect-[4/3] w-full object-cover outline outline-1 -outline-offset-1 outline-[oklch(0_0_0/0.1)]"
                />
              ) : (
                <div className="flex aspect-[16/9] w-full items-end bg-brand p-6 text-white sm:aspect-[4/3]">
                  {date && (
                    <div className="font-display leading-none">
                      <span className="block text-6xl font-semibold tabular-nums sm:text-7xl">{date.getDate()}</span>
                      <span className="mt-1 block text-xl font-medium">
                        {date.toLocaleDateString("en-GB", { month: "long" })}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-dashed border-line p-5">
                <p className="font-display text-xl font-semibold leading-snug break-words text-balance">{preview.name}</p>
                {when && <p className="mt-1 text-sm leading-relaxed text-muted">{when}</p>}
                <p className="mt-3 inline-flex items-center rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-muted">
                  Draft, not public yet
                </p>
              </div>
            </div>
          </aside>

          <div className="md:col-start-1 md:row-start-2">
            <ol className="max-w-[34rem] divide-y divide-line border-y border-line md:mt-8">
              {STEPS.map(([title, hint], i) => (
                <li key={title} className="flex gap-4 py-4">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-semibold text-brand-dark"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold">{title}</p>
                    <p className="text-sm leading-relaxed text-muted">{hint}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8">
              {!ready ? null : authToken ? (
                <button type="button" onClick={claim} disabled={claiming} className={BTN}>
                  {claiming ? "Claiming…" : "Claim your event"}
                </button>
              ) : (
                <Link href={loginHref} className={BTN}>
                  Sign in to claim
                </Link>
              )}
              {error && (
                <p role="alert" className="mt-4 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default function ClaimPage() {
  return (
    <Providers>
      <ClaimScreen />
    </Providers>
  );
}

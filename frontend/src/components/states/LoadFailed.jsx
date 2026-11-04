"use client";

import Image from "next/image";
import Link from "next/link";

const BUTTON =
  "inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold transition-[background-color,scale] duration-150 " +
  "active:scale-[0.96] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/**
 * A page that exists but couldn't be fetched (offline, server error, expired login).
 * Different from the 404 page, which is only for things that really aren't there.
 */
export default function LoadFailed({ title, message, onRetry }) {
  return (
    <main className="min-h-screen bg-white font-body text-ink">
      <header className="mx-auto flex max-w-5xl items-center px-5 py-6 sm:px-8">
        <Link href="/" aria-label="Byro home">
          <Image src="/assets/images/logo.svg" alt="byro" width={80} height={32} className="h-7 w-auto" priority />
        </Link>
      </header>
      <section role="alert" className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8 md:pt-16">
        <h1 className="max-w-xl font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-muted sm:text-lg">{message}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {onRetry && (
            <button type="button" onClick={onRetry} className={`${BUTTON} bg-brand text-white hover:bg-brand-dark`}>
              Try again
            </button>
          )}
          <Link href="/" className={`${BUTTON} border border-line bg-white text-ink hover:bg-mist`}>
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}

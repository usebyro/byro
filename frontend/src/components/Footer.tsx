"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { FaInstagram, FaTiktok, FaXTwitter } from "react-icons/fa6";
import API from "@/services/api";

const footerLinks = [
  {
    title: "Discover",
    links: [
      { label: "Concerts & music", href: "/discover?category=entertainment" },
      { label: "Sports", href: "/discover?category=fitness" },
      { label: "Nightlife", href: "/discover?category=nightlife" },
      { label: "Conferences", href: "/discover?category=conference" },
      { label: "Hackathons", href: "/discover?category=hackathon" },
    ],
  },
  {
    title: "Byro",
    links: [
      { label: "Create an event", href: "/events/create" },
      { label: "Communities", href: "/communities" },
      { label: "Pricing", href: "/pricing" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help center", href: "/faq" },
      { label: "Refund policy", href: "/refund-policy" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Cookie policy", href: "/cookies" },
    ],
  },
];

const socials = [
  { label: "Instagram", href: "https://instagram.com/usebyro_", icon: FaInstagram },
  { label: "X", href: "https://x.com/usebyro", icon: FaXTwitter },
  { label: "TikTok", href: "https://www.tiktok.com/@usebyro_", icon: FaTiktok },
];

const Footer = () => {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"form" | "sending" | "sent">("form");
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot: people never see it, bots fill it in

  const ask = async () => {
    const value = email.trim();
    if (!value) return setError("Enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setError("That email doesn\u2019t look right. Check it and try again.");
    setPhase("sending");
    try {
      await API.subscribeNewsletter(value, { website });
      setPhase("sent");
      setResent(false);
    } catch (err) {
      setPhase("form");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const resend = async () => {
    try {
      await API.subscribeNewsletter(email.trim(), { website });
    } catch {
      /* the first email already went out; the address is the same */
    }
    setResent(true);
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== "sending") ask();
  };

  return (
    <footer className="bg-paper font-body text-muted">
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 md:px-12 md:pb-10 md:pt-[72px] xl:px-24">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-14">
          <div className="flex flex-col gap-4">
            <Link href="/" className="inline-block" aria-label="Byro home">
              <Image src="/assets/images/logo.svg" alt="byro" width={88} height={50} className="h-10 w-auto md:h-12" />
            </Link>
            <p className="text-base">Go out. Keep the memory.</p>
            <div aria-live="polite" className="mt-2 max-w-md">
              {phase !== "sent" ? (
                <form onSubmit={handleSubscribe} noValidate className="flex flex-col gap-2">
                  <input
                    type="text"
                    name="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute -left-[9999px] h-0 w-0 opacity-0"
                  />
                  <div className="flex gap-2">
                    <label htmlFor="footer-email" className="sr-only">Email address</label>
                    <input
                      id="footer-email"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      aria-invalid={error ? "true" : "false"}
                      aria-describedby="footer-email-error"
                      placeholder="Get the week's best events by email"
                      className={`h-12 min-w-0 flex-1 rounded-full border bg-white px-[18px] text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${error ? "border-[#B42318]" : "border-line"}`}
                    />
                    <button
                      type="submit"
                      disabled={phase === "sending"}
                      className="h-12 shrink-0 rounded-full bg-ink px-5 text-sm font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {phase === "sending" ? "Sending" : "Subscribe"}
                    </button>
                  </div>
                  <span id="footer-email-error" className="min-h-0 pl-[18px] text-[13px] font-bold text-[#B42318]">{error}</span>
                </form>
              ) : (
                <div className="flex items-start gap-3.5 rounded-[20px] bg-white px-[18px] py-4">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#2451D6]">
                    <HugeiconsIcon icon={Mail01Icon} size={20} color="currentColor" strokeWidth={2} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[15px] font-extrabold text-ink">Check your inbox to confirm</span>
                    <span className="text-sm leading-normal text-[#3B4252]">
                      We sent a link to <b className="break-all text-ink">{email.trim()}</b>. Tap it and you&apos;re subscribed. Can&apos;t see it? Look in spam or promotions.
                    </span>
                    <span className="mt-1 flex flex-wrap gap-4">
                      <button type="button" onClick={resend} disabled={resent} className="min-h-8 text-sm font-extrabold text-[#2451D6] disabled:opacity-70">
                        {resent ? "Sent again" : "Resend the link"}
                      </button>
                      <button type="button" onClick={() => { setPhase("form"); setResent(false); }} className="min-h-8 text-sm font-bold text-muted">
                        Use a different email
                      </button>
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 md:contents">
            {footerLinks.map(({ title, links }) => (
              <div key={title} className="flex flex-col gap-3 text-[15px]">
                <h4 className="font-extrabold text-ink">{title}</h4>
                <ul className="flex flex-col gap-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="transition-colors hover:text-ink focus:outline-none focus-visible:text-ink focus-visible:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-sm text-faint md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Byro Ticketing Solutions. All rights reserved.</p>
          <ul className="flex gap-2">
            {socials.map(({ label, href, icon: Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Byro on ${label}`}
                  title={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink transition-[background-color,scale] hover:bg-mist active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Icon size={17} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

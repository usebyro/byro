"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
    ],
  },
];

const socials = [
  { label: "Instagram", href: "https://instagram.com/usebyro_" },
  { label: "X", href: "https://x.com/usebyro" },
];

const Footer = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "loading") return;
    setStatus("loading");
    try {
      const data = await API.subscribeNewsletter(email.trim());
      setStatus("done");
      setMessage(data?.message || "You're on the list.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  return (
    <footer className="bg-paper font-body text-muted">
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 md:px-12 md:pb-10 md:pt-[72px] xl:px-24">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-14">
          <div className="flex flex-col gap-4">
            <Link href="/" className="inline-block" aria-label="byro home">
              <Image src="/assets/images/logo.svg" alt="byro" width={88} height={50} className="h-10 w-auto md:h-12" />
            </Link>
            <p className="text-base">Go out. Keep the memory.</p>
            <form onSubmit={handleSubscribe} className="mt-2 flex max-w-md gap-2">
              <label htmlFor="footer-email" className="sr-only">Email address</label>
              <input
                id="footer-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status !== "loading") setStatus("idle");
                }}
                placeholder="Get the week's best events by email"
                className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-[18px] text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="h-12 shrink-0 rounded-full bg-ink px-5 text-sm font-bold text-white transition-[filter,scale] hover:brightness-125 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {status === "loading" ? "Subscribing" : "Subscribe"}
              </button>
            </form>
            <p role="status" className={`min-h-5 text-sm ${status === "error" ? "text-red-600" : "text-muted"}`}>
              {status === "done" || status === "error" ? message : ""}
            </p>
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

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-sm text-faint md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} Byro Ticketing Solutions. All rights reserved.</p>
          <p className="flex gap-[18px] font-semibold">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-ink"
              >
                {s.label}
              </a>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

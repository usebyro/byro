"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaInstagram, FaXTwitter } from "react-icons/fa6";
import API from "@/services/api";

const footerLinks = [
  {
    title: "Discover",
    links: [
      { label: "Concerts & music", href: "/discover?category=entertainment" },
      { label: "Sports", href: "/discover?category=fitness" },
      { label: "Nightlife", href: "/discover?category=art_culture" },
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

const socialIcons = [
  { label: "Instagram", icon: FaInstagram, href: "https://instagram.com/usebyro_" },
  { label: "Twitter / X", icon: FaXTwitter, href: "https://x.com/usebyro" },
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
  <footer className="bg-[#0F172A] text-white/70">
    <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-16">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.4fr] lg:gap-14">
        <div>
          <Link href="/" className="mb-5 inline-block">
            <Image
              src="/assets/images/logo.svg"
              alt="byro"
              width={72}
              height={30}
              className="h-7 w-auto brightness-0 invert"
            />
          </Link>
          <p className="max-w-[260px] text-[15px] leading-7">
            Byro is where events become communities. Discover, attend and never lose your people.
          </p>
          <div className="mt-6 flex items-center gap-3">
            {socialIcons.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-[#2563EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={label}
              >
                <Icon size={17} />
              </a>
            ))}
          </div>
        </div>

        {footerLinks.map(({ title, links }) => (
          <div key={title}>
            <h4 className="mb-4 text-sm font-semibold text-white">{title}</h4>
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[15px] transition-colors hover:text-white focus:outline-none focus-visible:text-white focus-visible:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h4 className="mb-4 text-sm font-semibold text-white">Stay in the loop</h4>
          <p className="mb-5 text-[15px]">New events and updates. No spam.</p>
          <form onSubmit={handleSubscribe} className="flex rounded-full bg-white/10 p-1 ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-white">
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
              placeholder="you@email.com"
              className="min-w-0 flex-1 bg-transparent px-4 text-sm text-white placeholder:text-white/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="shrink-0 rounded-full bg-[#2563EB] px-5 py-2 text-sm font-semibold text-white transition-colors hover:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
            >
              {status === "loading" ? "Subscribing" : "Subscribe"}
            </button>
          </form>
          <p
            role="status"
            className={`mt-3 min-h-5 text-sm ${status === "error" ? "text-red-300" : "text-white/80"}`}
          >
            {status === "done" || status === "error" ? message : ""}
          </p>
        </div>
      </div>
    </div>

    <div className="border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-6 text-sm text-white/50 lg:px-8">
        <p>© {new Date().getFullYear()} Byro Technologies. Lagos, Nigeria.</p>
      </div>
    </div>
  </footer>
  );
};

export default Footer;

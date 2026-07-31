"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CircleDot, Music2, Play, Trophy, Mic2 } from "lucide-react";

const footerLinks = {
  discover: [
    { label: "Concerts & Music", href: "/discover?category=entertainment" },
    { label: "Sports", href: "/discover?category=fitness" },
    { label: "Nightlife", href: "/discover?category=art_culture" },
    { label: "Conferences", href: "/discover?category=conference" },
    { label: "Browse all events", href: "/discover" },
  ],
  company: [
    { label: "About Byro", href: "/about" },
    { label: "Careers", href: "/careers" },
    { label: "Press", href: "/press" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ],
  support: [
    { label: "Help center", href: "/faq" },
    { label: "Refund policy", href: "/refund-policy" },
    { label: "Terms of service", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Sell tickets", href: "/sell-tickets" },
  ],
};

const socialIcons = [
  { label: "Music", icon: Music2 },
  { label: "Discover", icon: CircleDot },
  { label: "Podcast", icon: Mic2 },
  { label: "Awards", icon: Trophy },
];

const Footer = () => {
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      console.log("Subscribed:", email);
      setEmail("");
    }
  };

  return (
    <footer className="bg-[#0d347b] text-[#b9c9ed]">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr_1.45fr] lg:gap-14">
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
            <p className="max-w-[240px] text-[15px] leading-7">
              The home of live events in Lagos. Discover concerts, sport, nightlife
              and conferences — book in seconds.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {socialIcons.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
                  aria-label={label}
                >
                  <Icon size={17} strokeWidth={1.8} />
                </span>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="mb-4 text-[11px] font-black uppercase tracking-[0.16em] text-[#9eb3df]">
                {title}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[15px] text-[#b9c9ed] transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="mb-4 text-[11px] font-black uppercase tracking-[0.16em] text-[#9eb3df]">
              Stay in the loop
            </h4>
            <p className="mb-5 text-[15px]">New drops every week. No spam.</p>
            <form
              onSubmit={handleSubscribe}
              className="flex rounded-full border border-white/25 bg-white/10 p-1 shadow-inner"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="min-w-0 flex-1 bg-transparent px-4 text-sm text-white placeholder:text-[#c2cdec] focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-black text-[#174188] transition-colors hover:bg-[#eef4ff]"
              >
                Subscribe
              </button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-lg border border-white/20 bg-white/10 px-7 py-2 text-sm text-white">
                App Store
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-2 text-sm text-white">
                <Play size={14} />
                Google Play
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 text-sm text-[#9fb1d8] md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} Byro Technologies. Lagos, Nigeria.</p>
          <div className="flex items-center gap-7">
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link href="/cookies" className="transition-colors hover:text-white">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

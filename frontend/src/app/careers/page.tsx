import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  FiUsers,
  FiBookOpen,
  FiEye,
  FiHeart,
  FiMonitor,
  FiGlobe,
  FiDollarSign,
  FiClock,
  FiCalendar,
  FiTrendingUp,
  FiMapPin,
  FiBriefcase,
  FiArrowRight,
} from "react-icons/fi";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Help us build the platform that turns events into communities. See open roles at Byro.",
  alternates: { canonical: "/careers" },
};

const APPLY_FORM_URL = "https://tally.so/r/rjX8Q5";

const VALUES = [
  {
    icon: FiUsers,
    tile: "bg-blue-50 text-blue-600",
    title: "Community first",
    body: "Every feature starts with an organiser running a meetup from a WhatsApp group. If it doesn't help them, we don't ship it.",
  },
  {
    icon: FiBookOpen,
    tile: "bg-emerald-50 text-emerald-600",
    title: "Curiosity",
    body: "We learn how events really run: at the door, at the bank, on the group chat. Then we build for that.",
  },
  {
    icon: FiEye,
    tile: "bg-slate-100 text-slate-600",
    title: "Transparency",
    body: "Clear fees, clear payouts, clear decisions. We share the reasoning, not just the outcome.",
  },
  {
    icon: FiHeart,
    tile: "bg-rose-50 text-rose-500",
    title: "Care",
    body: "Behind every ticket is someone showing up to meet people. We sweat the details that make that moment easy.",
  },
];

const BENEFITS = [
  { icon: FiMonitor, title: "Modern tools", body: "A current stack and the equipment you need to do your best work." },
  { icon: FiGlobe, title: "Remote-friendly", body: "Work from wherever you do your best thinking. We keep in sync online." },
  { icon: FiDollarSign, title: "Fair pay", body: "Transparent, market-based pay, reviewed regularly." },
  { icon: FiClock, title: "Flexible hours", body: "Own your schedule. We care about outcomes, not office hours." },
  { icon: FiCalendar, title: "Event perks", body: "Free tickets to events on Byro, so you see the product as attendees do." },
  { icon: FiTrendingUp, title: "Room to grow", body: "Small team, real ownership, and a learning budget to back it up." },
];

const JOBS = [
  {
    title: "Social Media Manager",
    location: "Remote",
    type: "Entry level",
    blurb:
      "Post and schedule content across platforms, research trends, build content calendars, handle engagement and report on results every month.",
  },
  {
    title: "Graphic Designer",
    location: "Remote",
    type: "Entry level",
    blurb:
      "Design all Byro content and brand assets, and keep everything we put out visually consistent.",
  },
  {
    title: "Content Creator & Video Editor",
    location: "Remote",
    type: "Entry level",
    blurb:
      "Research video content trends, then shoot and edit all of Byro's brand video content.",
  },
  {
    title: "Brand Designer",
    location: "Remote",
    type: "Entry level",
    blurb:
      "Shape how Byro looks and feels: our identity, visual language and the brand guidelines that keep every touchpoint on-brand.",
  },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-white text-[#0B0F19]">
      <Navbar />

      <main>
        {/* Hero */}
        <section className="bg-gradient-to-b from-[#F2F8FF] to-white px-4 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Your next role.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Byro is where events become communities. We&apos;re a small team
              building tools for the people who bring others together. Come help
              us do it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="#values"
                className="w-full rounded-md bg-[#4F6EF7] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#3f5ce0] sm:w-auto"
              >
                Who we are
              </Link>
              <Link
                href="#jobs"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-[#0B0F19] shadow-sm transition hover:bg-slate-50 sm:w-auto"
              >
                <FiBriefcase className="text-slate-500" />
                View jobs
              </Link>
            </div>
          </div>
        </section>

        {/* Core values */}
        <section id="values" className="scroll-mt-20 px-4 py-16 sm:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4F6EF7]">
                Core values
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                A few things you should know about us.
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
                We&apos;re building for organisers who run events on passion and
                a spreadsheet. These are the principles we hold ourselves to.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              {VALUES.map(({ icon: Icon, tile, title, body }) => (
                <div key={title}>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${tile}`}
                  >
                    <Icon className="text-lg" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="border-y border-slate-100 bg-[#F8FAFC] px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-semibold tracking-tight">
              Benefits at Byro
            </h2>
            <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="text-center">
                  <Icon className="mx-auto text-2xl text-[#4F6EF7]" />
                  <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Jobs */}
        <section id="jobs" className="scroll-mt-20 px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Let&apos;s find your job
              </h2>
              <p className="mt-3 text-sm text-slate-600">
                Entry-level roles across social, design and content.
              </p>
            </div>

            <ul className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
              {JOBS.map((job) => (
                <li
                  key={job.title}
                  className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
                >
                  <div className="max-w-xl">
                    <h3 className="text-base font-semibold">{job.title}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <FiMapPin /> {job.location}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <FiClock /> {job.type}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      {job.blurb}
                    </p>
                  </div>
                  <a
                    href={APPLY_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-md bg-[#4F6EF7] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#3f5ce0] sm:self-center"
                  >
                    Apply
                    <FiArrowRight />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Open application banner */}
        <section className="px-4 pb-20">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-xl bg-[#4F6EF7] px-6 py-10 text-white sm:flex-row sm:items-center sm:px-10">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold">
                Don&apos;t see the right role?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                We&apos;re always keen to meet people who care about
                communities. Send us a note and tell us how you&apos;d help.
              </p>
            </div>
            <a
              href={APPLY_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md bg-white px-5 py-2.5 text-sm font-medium text-[#4F6EF7] transition hover:bg-slate-50"
            >
              Send an open application
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

"use client";

import Image from "next/image";
import { displayStyle } from "./fonts";
import { Reveal, useInView } from "./Reveal";

const field = "rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] ring-1 ring-[#0F172A]/15";
const tag = "text-[10px] font-medium text-[#0F172A]/50";

const DetailsPreview = () => (
  <div className="space-y-2.5">
    <div>
      <p className={tag}>Event name</p>
      <p className={field}>Rooftop Sessions</p>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {["Concerts", "Sports", "Nightlife"].map((c) => (
        <span
          key={c}
          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
            c === "Nightlife" ? "bg-[#2563EB] text-white" : "bg-[#F8FAFC] text-[#0F172A]/60 ring-1 ring-[#0F172A]/15"
          }`}
        >
          {c}
        </span>
      ))}
    </div>
    <div className="flex items-center gap-3">
      <Image
        src="/images/people_grooving.png"
        alt=""
        width={56}
        height={56}
        className="h-12 w-12 rounded-lg object-cover ring-1 ring-[#0F172A]/20"
      />
      <p className="text-[11px] font-medium text-[#0F172A]/60">Cover image</p>
    </div>
  </div>
);

const PlacePreview = () => (
  <div className="space-y-2.5">
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className={tag}>Date</p>
        <p className={field}>Sat, 12 Oct</p>
      </div>
      <div>
        <p className={tag}>Start time</p>
        <p className={field}>8:00 PM</p>
      </div>
    </div>
    <div>
      <p className={tag}>Venue</p>
      <p className={field}>Victoria Island, Lagos</p>
    </div>
  </div>
);

const TicketsPreview = () => (
  <div className="space-y-2">
    {[
      { name: "Early bird", price: "₦5,000", left: "50 available" },
      { name: "General", price: "₦8,000", left: "200 available" },
    ].map((t) => (
      <div key={t.name} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2 ring-1 ring-[#0F172A]/15">
        <div>
          <p className="text-xs font-semibold text-[#0F172A]">{t.name}</p>
          <p className="text-[10px] text-[#0F172A]/50">{t.left}</p>
        </div>
        <p className="text-xs font-bold text-[#0F172A]">{t.price}</p>
      </div>
    ))}
    <div className="flex items-center justify-between pt-1 text-[11px] font-medium text-[#0F172A]/70">
      Transferable tickets
      <span className="flex h-4 w-7 items-center justify-end rounded-full bg-[#2563EB] px-0.5">
        <span className="h-3 w-3 rounded-full bg-white" />
      </span>
    </div>
  </div>
);

const PublishPreview = () => (
  <div className="space-y-3">
    <p className="rounded-lg bg-[#2563EB] px-3 py-2 text-center text-xs font-semibold text-white">Publish event</p>
    <div className="flex flex-wrap gap-1.5">
      {["WhatsApp", "X", "Telegram", "Copy link"].map((c) => (
        <span key={c} className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-semibold text-[#0F172A]/70 ring-1 ring-[#0F172A]/15">
          {c}
        </span>
      ))}
    </div>
  </div>
);

const steps = [
  {
    title: "Add the details",
    body: "Name it, pick a category, write a description and add a cover image.",
    preview: <DetailsPreview />,
  },
  {
    title: "Set the date and place",
    body: "Choose the date, start time and venue.",
    preview: <PlacePreview />,
  },
  {
    title: "Set up your tickets",
    body: "Free or paid tiers, how many you'll sell, and whether tickets can be transferred.",
    preview: <TicketsPreview />,
  },
  {
    title: "Publish and share",
    body: "List it publicly or keep it unlisted, then share it on WhatsApp, X, Telegram or with a link.",
    preview: <PublishPreview />,
  },
];

const lineShape = "absolute left-[15px] top-10 -bottom-14 w-0.5 md:left-1/2 md:-ml-px";

const CreateEventSteps = () => {
  const [ref, seen] = useInView<HTMLOListElement>(0.2);

  return (
    <section className="border-t border-[#0F172A]/10 bg-[#F8FAFC] py-16 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2
            className="max-w-2xl text-[2.4rem] font-extrabold leading-[1.02] tracking-[-0.02em] text-[#0F172A] sm:text-6xl"
            style={displayStyle}
          >
            Publish your event in four steps.
          </h2>
        </Reveal>

        <ol ref={ref} className="mt-14 grid max-w-5xl gap-14 md:mx-auto md:gap-16">
          {steps.map((s, i) => (
            <li key={s.title} className="relative pl-14 sm:pl-16 md:pl-0">
              <span className="absolute left-0 top-0 z-10 flex h-8 w-8 md:left-1/2 md:-ml-4 items-center justify-center rounded-full bg-[#2563EB] text-sm font-bold text-white">
                {i + 1}
              </span>
              {i < steps.length - 1 && (
                <>
                  <span aria-hidden="true" className={`${lineShape} bg-[#0F172A]/15`} />
                  <span
                    aria-hidden="true"
                    style={{ transitionDelay: `${i * 350}ms` }}
                    className={`${lineShape} origin-top bg-[#2563EB] transition-transform duration-500 ease-out motion-reduce:transition-none ${
                      seen ? "scale-y-100" : "scale-y-0"
                    }`}
                  />
                </>
              )}
              <Reveal delay={i * 350}>
                <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-24">
                  <div className={`md:pt-1 ${i % 2 === 0 ? "" : "md:text-right md:justify-self-end"}`}>
                    <h3 className="text-xl font-bold text-[#0F172A] sm:text-2xl" style={displayStyle}>
                      {s.title}
                    </h3>
                    <p className={`mt-2 max-w-sm text-sm leading-relaxed text-[#0F172A]/70 sm:text-base ${i % 2 === 0 ? "" : "md:ml-auto"}`}>
                      {s.body}
                    </p>
                  </div>
                  <div
                    aria-hidden="true"
                    className={`w-full max-w-[340px] rounded-2xl bg-white p-4 ring-2 ring-[#0F172A] shadow-[3px_3px_0_#0F172A] ${
                      i % 2 === 0 ? "md:order-first md:justify-self-end" : "md:order-last md:justify-self-start"
                    }`}
                  >
                    {s.preview}
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default CreateEventSteps;

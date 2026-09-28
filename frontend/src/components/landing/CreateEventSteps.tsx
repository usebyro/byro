"use client";

import { displayStyle } from "./fonts";
import { Reveal, useInView } from "./Reveal";

const steps = [
  { title: "Add the details", body: "Name your event, pick a date and venue, and upload a cover image." },
  { title: "Set your tickets", body: "Make it free or paid, add ticket types, and cap how many you sell." },
  { title: "Publish and share", body: "List it on Byro or keep it private and share the link yourself." },
  { title: "Check guests in", body: "Scan tickets at the door, then request your payout when the event is done." },
];

const lineShape =
  "absolute left-[15px] top-10 -bottom-10 w-0.5 lg:left-10 lg:-right-8 lg:bottom-auto lg:top-[15px] lg:h-0.5 lg:w-auto";

const CreateEventSteps = () => {
  const [ref, seen] = useInView<HTMLOListElement>(0.3);

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

        <ol ref={ref} className="mt-14 grid gap-14 lg:grid-cols-4 lg:gap-8">
          {steps.map((s, i) => (
            <li key={s.title} className="relative pl-14 lg:pl-0 lg:pt-14">
              <span className="absolute left-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-sm font-bold text-white">
                {i + 1}
              </span>
              {i < steps.length - 1 && (
                <>
                  <span aria-hidden="true" className={`${lineShape} bg-[#0F172A]/15`} />
                  <span
                    aria-hidden="true"
                    style={{ transitionDelay: `${i * 350}ms` }}
                    className={`${lineShape} origin-top bg-[#2563EB] transition-transform duration-500 ease-out motion-reduce:transition-none lg:origin-left ${
                      seen ? "scale-x-100 scale-y-100" : "scale-y-0 lg:scale-x-0 lg:scale-y-100"
                    }`}
                  />
                </>
              )}
              <Reveal delay={i * 350}>
                <h3 className="text-lg font-bold text-[#0F172A]">{s.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#0F172A]/70">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default CreateEventSteps;

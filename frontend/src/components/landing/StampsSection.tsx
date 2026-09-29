import Stamp, { type StampInk } from "@/components/brand/Stamp";
import { Reveal } from "./Reveal";

const wall: { name: string; city: string; date: string; ink: StampInk; shape: "round" | "square"; size: number; x: number; y: number; tilt: number; filled: boolean }[] = [
  { name: "Rooftop Sessions", city: "LAGOS", date: "03.10", ink: "blue", shape: "round", size: 180, x: 80, y: 60, tilt: -10, filled: true },
  { name: "Sunday Run Club", city: "LAGOS", date: "28.09", ink: "pink", shape: "square", size: 150, x: 300, y: 40, tilt: 7, filled: false },
  { name: "Jazz in the Park", city: "ABUJA", date: "21.09", ink: "green", shape: "round", size: 140, x: 500, y: 110, tilt: -4, filled: true },
  { name: "Art Walk", city: "LAGOS", date: "14.09", ink: "gold", shape: "round", size: 130, x: 40, y: 300, tilt: 12, filled: false },
  { name: "Night Market", city: "ACCRA", date: "06.09", ink: "blue", shape: "square", size: 160, x: 220, y: 250, tilt: -6, filled: false },
  { name: "Supper Club", city: "IKOYI", date: "23.08", ink: "pink", shape: "round", size: 170, x: 420, y: 310, tilt: 5, filled: true },
  { name: "Comedy Night", city: "LEKKI", date: "16.08", ink: "green", shape: "square", size: 120, x: 620, y: 300, tilt: -9, filled: false },
];

const steps = [
  { title: "Buy a ticket.", body: "Pay in seconds, get it instantly." },
  { title: "Show up.", body: "Scan your ticket at the door." },
  { title: "Get your stamp.", body: "It lands in your profile." },
];

export default function StampsSection() {
  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-14 md:px-12 md:pt-[140px] xl:px-24">
      <div className="relative flex flex-col overflow-hidden rounded-[30px] bg-butter md:rounded-[40px] lg:h-[560px] lg:flex-row">
        <Reveal className="flex flex-col gap-4 px-[22px] py-8 md:gap-[22px] md:px-12 md:py-14 lg:w-[520px] lg:shrink-0 lg:pl-[72px] lg:pt-[72px] xl:w-[560px]">
          <h2 className="text-balance font-display text-[34px] font-bold leading-none tracking-[-0.035em] md:text-[56px]">
            Every night out
            <br />
            leaves a stamp.
          </h2>
          <p className="max-w-[420px] text-[15px] leading-[1.55] text-muted md:text-lg md:leading-[1.6]">
            Your byro passport fills up as you go. Look back at the gigs, runs and dinners that made the year.
          </p>
          <ol className="mt-2 flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-center gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white font-extrabold text-brand">
                  {i + 1}
                </span>
                <span className="text-base">
                  <b>{s.title}</b> {s.body}
                </span>
              </li>
            ))}
          </ol>
        </Reveal>

        {/* mobile: three overlapping stamps */}
        <div aria-hidden="true" className="relative mx-[22px] mb-8 h-[170px] lg:hidden">
          {[wall[0], wall[1], wall[2]].map((s, i) => (
            <Reveal key={s.name} variant="stamp" delay={i * 140} className="absolute" style={{ left: i * 112, top: i === 1 ? 30 : i === 2 ? -6 : 8 }}>
              <Stamp {...s} size={i === 1 ? 110 : 120} filled={i !== 1} tilt={i === 0 ? -10 : i === 1 ? 7 : -4} />
            </Reveal>
          ))}
        </div>

        {/* desktop: the wall */}
        <div aria-hidden="true" className="relative hidden flex-1 lg:block">
          <div className="absolute left-0 top-0 h-[560px] w-[760px] origin-top-left lg:scale-[0.5] xl:scale-[0.8] min-[1440px]:scale-100">
            {wall.map((s, i) => (
              <Reveal
                key={s.name}
                variant="stamp"
                delay={i * 140}
                className="absolute"
                style={{ left: s.x, top: s.y }}
              >
                <Stamp {...s} tilt={s.tilt} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

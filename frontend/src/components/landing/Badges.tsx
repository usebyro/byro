import { displayStyle } from "./fonts";
import { Reveal } from "./Reveal";

const steps = [
  { title: "Buy a ticket", body: "Pay in seconds and get your ticket instantly." },
  { title: "Show up", body: "Scan your ticket at the door." },
  { title: "Get your badge", body: "It lands in your profile, next to every other night you've been to." },
];

const badges = [
  { name: "Rooftop Sessions", tone: "border-[#FFC93C] text-[#FFC93C]", rotate: "-rotate-12" },
  { name: "Sunday Run Club", tone: "border-white text-white", rotate: "rotate-6" },
  { name: "Builders Meetup", tone: "border-white/50 text-white/70", rotate: "rotate-12" },
  { name: "Jazz in the Park", tone: "border-white text-white", rotate: "-rotate-6" },
  { name: "Art Walk", tone: "border-[#FFC93C] text-[#FFC93C]", rotate: "rotate-3" },
  { name: "Night Market", tone: "border-white/50 text-white/70", rotate: "-rotate-3" },
];

const Badges = () => (
  <section className="bg-[#0F172A] py-16 text-white sm:py-28">
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div>
        <h2 className="text-[2.4rem] font-extrabold leading-[1.02] tracking-[-0.02em] sm:text-6xl" style={displayStyle}>
          Every night out
          <br />
          leaves a badge.
        </h2>
        <ol className="mt-10 max-w-md space-y-6">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#FFC93C] text-sm font-bold text-[#0F172A]">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/65">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div aria-hidden="true" className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3 sm:gap-6 lg:max-w-none">
        {badges.map((b, i) => (
          <Reveal key={b.name} variant="stamp" delay={i * 140}>
            <div className={`flex aspect-square items-center justify-center rounded-full border-2 border-dashed p-2 text-center sm:p-3 ${b.tone} ${b.rotate}`}>
              <span className="text-[10px] font-bold leading-tight min-[400px]:text-xs sm:text-sm" style={displayStyle}>
                {b.name}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export default Badges;

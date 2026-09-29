import Link from "next/link";
import { Reveal } from "./Reveal";

export default function FinalCta() {
  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-16 md:px-12 md:pt-[130px] xl:px-24">
      <Reveal>
        <div className="relative flex flex-col items-center justify-center gap-5 overflow-hidden rounded-[30px] bg-brand px-[22px] py-10 text-center text-white md:h-[380px] md:gap-6 md:rounded-[40px] md:py-0">
          <span aria-hidden="true" className="absolute -left-5 -top-5 h-[100px] w-[100px] -rotate-12 rounded-full border-4 border-double border-white/35 md:left-[70px] md:top-[60px] md:h-[120px] md:w-[120px] md:border-[5px]" />
          <span aria-hidden="true" className="absolute bottom-[50px] right-[90px] hidden h-[110px] w-[150px] rotate-[8deg] rounded-3xl border-[5px] border-double border-white/35 md:block" />
          <span aria-hidden="true" className="absolute right-[220px] top-10 hidden h-[70px] w-[70px] rounded-full border-4 border-double border-white/30 md:block" />
          <h2 className="relative text-balance font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] md:text-[72px] md:leading-none md:tracking-[-0.04em]">
            Your next stamp is
            <br className="hidden md:block" /> one ticket away.
          </h2>
          <div className="relative flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <Link
              href="/discover"
              className="flex h-[50px] items-center justify-center rounded-full bg-white px-7 text-[15px] font-bold text-ink transition-[filter,scale] hover:brightness-95 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand md:h-[54px] md:text-base"
            >
              Find events
            </Link>
            <Link
              href="/events/create"
              className="hidden h-[54px] items-center justify-center rounded-full border-[1.5px] border-white/60 px-7 text-base font-bold text-white transition-[background-color,scale] hover:bg-white/10 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex"
            >
              Create an event
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

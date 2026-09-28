import Link from "next/link";
import { displayStyle } from "./fonts";
import { Reveal } from "./Reveal";

const CommunitySection = () => (
  <section className="bg-white px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
    <Reveal className="mx-auto max-w-6xl">
    <div className="flex w-full max-w-6xl flex-col items-start justify-between gap-8 rounded-3xl bg-[#2563EB] p-6 text-white sm:p-14 md:flex-row md:items-center">
      <div>
        <h2 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-5xl" style={displayStyle}>
          Hosting something?
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">
          Sell tickets, keep your crowd together, and give every guest a badge to remember it by.
        </p>
      </div>
      <Link
        href="/events/create"
        className="w-full flex-shrink-0 rounded-xl bg-white px-7 text-center md:w-auto py-3.5 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-[#FFC93C] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563EB]"
      >
        Create an event
      </Link>
    </div>
    </Reveal>
  </section>
);

export default CommunitySection;

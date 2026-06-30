import Link from "next/link";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home01Icon, Search01Icon, Calendar01Icon, Location01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#EEF2FF] flex flex-col">
      {/* Top-left logo */}
      <div className="p-6">
        <Link href="/">
          <Image src="/assets/images/logo.svg" alt="byro" width={72} height={28} />
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16 -mt-8">

        {/* Rotated mock event card */}
        <div className="mb-14" style={{ transform: "rotate(6deg)" }}>
          <div className="w-52 rounded-2xl overflow-hidden shadow-2xl">

            {/* Gradient top — event hero */}
            <div
              className="px-4 pt-5 pb-10"
              style={{
                background: "linear-gradient(160deg, #2D0A3E 0%, #6B1F8A 55%, #9B3DB8 100%)",
              }}
            >
              {/* Category badge */}
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 mb-8"
                style={{ background: "rgba(0,0,0,0.35)" }}>
                <HugeiconsIcon icon={MusicNote01Icon} size={10} color="white" />
                <span className="text-white text-[10px] font-bold tracking-widest">CONCERTS &amp; MUSIC</span>
              </div>

              {/* "Event name" = 404 */}
              <p className="text-white text-4xl font-black leading-none">404</p>
            </div>

            {/* White bottom */}
            <div className="bg-white px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <HugeiconsIcon icon={Calendar01Icon} size={13} color="#9ca3af" />
                <span className="text-xs text-gray-500">Page not found</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <HugeiconsIcon icon={Location01Icon} size={13} color="#9ca3af" />
                <span className="text-xs text-gray-500">Off the grid</span>
              </div>

              <hr className="border-dashed border-gray-200 mb-3" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">FROM</p>
                  <p className="text-sm font-bold text-gray-900">₦&mdash;</p>
                </div>
                <span className="bg-blue-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1">
                  Get tickets
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 404 number */}
        <h1
          className="text-[96px] sm:text-[120px] font-black text-gray-900 leading-none mb-3 select-none"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          404
        </h1>

        {/* Heading */}
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 text-center">
          We lost that page in the crowd
        </h2>

        {/* Subtext */}
        <p className="text-gray-500 text-center max-w-sm text-sm leading-relaxed mb-9">
          The link may be broken or the event has ended. Let&apos;s get you back to the good shows.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Link
            href="/"
            className="flex items-center gap-2 bg-blue-600 text-white font-semibold px-6 py-3 rounded-full hover:bg-blue-700 transition-colors text-sm"
          >
            <HugeiconsIcon icon={Home01Icon} size={16} color="white" />
            Back to home
          </Link>
          <Link
            href="/discover"
            className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-white font-semibold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors text-sm"
          >
            <HugeiconsIcon icon={Search01Icon} size={16} color="#2563eb" />
            Browse events
          </Link>
        </div>
      </div>
    </div>
  );
}

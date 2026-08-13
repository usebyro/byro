"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CommunitiesPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white">
        <section className="relative bg-gradient-to-b from-[#EEF2FF] via-white to-white pt-24 pb-20 overflow-hidden">
          {/* Decorative globe, subtle background */}
          <style>{`
            @keyframes byroGlobeBeam {
              to { stroke-dashoffset: -400; }
            }
            @keyframes byroGlobePing {
              0% { transform: scale(0.4); opacity: 0.6; }
              100% { transform: scale(2.2); opacity: 0; }
            }
            .byro-globe-beam {
              stroke-dasharray: 6 12;
              animation: byroGlobeBeam 5s linear infinite;
            }
            .byro-globe-ping {
              transform-box: fill-box;
              transform-origin: center;
              animation: byroGlobePing 2.6s ease-out infinite;
            }
          `}</style>
          <svg
            className="pointer-events-none select-none absolute top-[54%] left-1/2 -translate-x-1/2 -translate-y-1/2 mt-6 w-[560px] h-[560px] sm:w-[700px] sm:h-[700px]"
            viewBox="0 0 600 600"
            fill="none"
            aria-hidden="true"
          >
            {/* Globe wireframe */}
            <g stroke="#2563eb" strokeWidth="1.2" opacity="0.07">
              <circle cx="300" cy="300" r="280" />
              <ellipse cx="300" cy="300" rx="210" ry="280" />
              <ellipse cx="300" cy="300" rx="120" ry="280" />
              <ellipse cx="300" cy="300" rx="40" ry="280" />
              <clipPath id="communitiesGlobeClip">
                <circle cx="300" cy="300" r="280" />
              </clipPath>
              <g clipPath="url(#communitiesGlobeClip)">
                <line x1="20" y1="150" x2="580" y2="150" />
                <line x1="20" y1="225" x2="580" y2="225" />
                <line x1="20" y1="300" x2="580" y2="300" />
                <line x1="20" y1="375" x2="580" y2="375" />
                <line x1="20" y1="450" x2="580" y2="450" />
              </g>
            </g>

            {/* Beams connecting communities around the globe */}
            <g fill="none" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" opacity="0.22">
              <path className="byro-globe-beam" d="M460,71 Q380,180 529,471" style={{ animationDelay: "0s" }} />
              <path className="byro-globe-beam" d="M529,471 Q300,520 71,471" style={{ animationDelay: "-1.6s" }} />
              <path className="byro-globe-beam" d="M71,471 Q220,420 71,129" style={{ animationDelay: "-3.2s" }} />
              <path className="byro-globe-beam" d="M71,129 Q300,80 460,71" style={{ animationDelay: "-4.4s" }} />
            </g>

            {/* Community "house" pins with pulse */}
            {[
              { x: 460, y: 71 },
              { x: 529, y: 471 },
              { x: 71, y: 471 },
              { x: 71, y: 129 },
            ].map((node, i) => (
              <g key={i} transform={`translate(${node.x},${node.y})`}>
                <circle
                  className="byro-globe-ping"
                  r="7"
                  fill="#2563eb"
                  opacity="0.18"
                  style={{ animationDelay: `${i * 0.6}s` }}
                />
                <path
                  d="M-6,1 L-6,-4 L0,-9 L6,-4 L6,1 Z"
                  fill="#2563eb"
                  opacity="0.28"
                />
              </g>
            ))}
          </svg>

          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-full px-4 py-2 mb-8 shadow-sm">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-sm text-gray-600 font-medium">
                Communities are coming to Byro
              </span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 mb-5 leading-[1.1] tracking-tight">
              Find the{" "}
              <span
                className="italic text-blue-600"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 }}
              >
                communities
              </span>{" "}
              shaping your city
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
              Soon you&apos;ll be able to follow the groups behind your favourite
              events and never miss what they&apos;re planning next.
            </p>

            {/* Search bar (preview, not yet functional) */}
            <div className="max-w-2xl mx-auto">
              <div
                className="flex items-center bg-white border border-gray-200 rounded-full shadow-lg overflow-hidden pr-2 opacity-60 cursor-not-allowed"
                title="Coming soon"
              >
                <div className="flex-1 flex items-center px-5">
                  <svg
                    className="text-gray-400 mr-3 flex-shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    disabled
                    placeholder="Search communities"
                    className="flex-1 text-gray-700 text-sm placeholder-gray-400 focus:outline-none bg-transparent py-3.5 cursor-not-allowed"
                  />
                </div>
                <button
                  type="button"
                  disabled
                  className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-full flex-shrink-0 cursor-not-allowed"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

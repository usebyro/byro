"use client";

const AppBanner = () => {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 rounded-3xl overflow-hidden relative">
          <div className="flex flex-col lg:flex-row items-center gap-8 px-8 sm:px-12 lg:px-16 py-12 lg:py-16">
            {/* Content */}
            <div className="text-white relative z-10 flex-1 text-center lg:text-left">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 leading-tight max-w-sm">
                Your tickets, in your pocket
              </h2>
              <p className="text-blue-100 text-base sm:text-lg mb-8 max-w-sm leading-relaxed">
                Download the Byro app for instant QR entry, live event updates
                and your full ticket wallet — offline ready.
              </p>
              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                <a
                  href="#"
                  className="inline-flex items-center gap-2 bg-white text-gray-900 font-semibold px-6 py-3 rounded-full hover:bg-gray-50 transition-colors text-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  App Store
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 font-semibold px-6 py-3 rounded-full hover:bg-white/20 transition-colors text-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
                  </svg>
                  Google Play
                </a>
              </div>
            </div>

            {/* Phone / ticket mockups */}
            <div className="relative hidden lg:block flex-shrink-0" style={{ width: "260px", height: "280px" }}>
              {/* Left card — behind, tilted left */}
              <div
                className="absolute w-44 rounded-3xl shadow-2xl overflow-hidden z-10"
                style={{
                  height: "260px",
                  left: "0px",
                  top: "10px",
                  transform: "rotate(-8deg)",
                }}
              >
                <div className="w-full h-full bg-gradient-to-br from-purple-700 via-purple-500 to-pink-500 relative flex flex-col justify-end p-4">
                  {/* subtle inner highlight */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  {/* Badge — same pill style as EventCard */}
                  <span className="relative inline-flex items-center gap-1.5 self-start bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-300 flex-shrink-0" />
                    CONCERTS &amp; MUSIC
                  </span>
                </div>
              </div>

              {/* Right card — in front, tilted right */}
              <div
                className="absolute w-44 rounded-3xl shadow-2xl overflow-hidden z-20"
                style={{
                  height: "260px",
                  right: "0px",
                  top: "0px",
                  transform: "rotate(8deg)",
                }}
              >
                <div className="w-full h-full bg-gradient-to-br from-pink-600 via-pink-500 to-rose-400 relative flex flex-col justify-end p-4">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <span className="relative inline-flex items-center gap-1.5 self-start bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold tracking-wide px-2.5 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-300 flex-shrink-0" />
                    NIGHTLIFE &amp; PARTY
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Background blur blobs */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />
        </div>
      </div>
    </section>
  );
};

export default AppBanner;

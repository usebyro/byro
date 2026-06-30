"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { MusicNote01Icon, FootballIcon, Moon02Icon, Mic01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";

const categories = [
  { label: "Concerts", icon: MusicNote01Icon, value: "entertainment" },
  { label: "Sports", icon: FootballIcon, value: "fitness" },
  { label: "Nightlife", icon: Moon02Icon, value: "art_culture" },
  { label: "Conferences", icon: Mic01Icon, value: "conference" },
  { label: "This weekend", icon: Calendar03Icon, value: "weekend" },
];

const Hero = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All genres");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (selectedGenre !== "All genres") params.set("category", selectedGenre.toLowerCase());
    router.push(`/discover?${params.toString()}`);
  };

  const handleCategoryClick = (value: string) => {
    if (value === "weekend") {
      router.push("/discover?when=weekend");
    } else {
      router.push(`/discover?category=${value}`);
    }
  };

  return (
    <section className="relative bg-gradient-to-b from-[#EEF2FF] via-white to-white pt-14 pb-16 overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Live events badge */}
        <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-full px-4 py-2 mb-8 shadow-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-sm text-gray-600 font-medium">
            1,240 live events across Lagos this month
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-gray-900 mb-5 leading-[1.1] tracking-tight">
          Find your next{" "}
          <span
            className="italic text-blue-600"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 }}
          >
            night out
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
          From sold-out concerts to Sunday derbies — discover, book
          <br className="hidden sm:block" /> and hold every ticket in one place.
        </p>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-6">
          <div className="flex items-center bg-white border border-gray-200 rounded-full shadow-lg overflow-hidden pr-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
            {/* Genre dropdown */}
            <div className="relative flex-shrink-0">
              <div className="flex items-center gap-2 pl-4 pr-3 py-3.5 border-r border-gray-200 cursor-pointer">
                <svg
                  className="text-gray-500 flex-shrink-0"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="appearance-none bg-transparent text-gray-700 text-sm font-medium focus:outline-none cursor-pointer pr-5"
                >
                  <option value="All genres">All genres</option>
                  <option value="entertainment">Concerts</option>
                  <option value="fitness">Sports</option>
                  <option value="art_culture">Nightlife</option>
                  <option value="conference">Conferences</option>
                </select>
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            {/* Search input */}
            <div className="flex-1 flex items-center px-4">
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search artists, events, venues..."
                className="flex-1 text-gray-700 text-sm placeholder-gray-400 focus:outline-none bg-transparent py-3.5"
              />
            </div>

            {/* Search button */}
            <button
              type="submit"
              className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              Search
            </button>
          </div>
        </form>

        {/* Category chips */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {categories.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => handleCategoryClick(cat.value)}
              className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full transition-all ${
                i === 0
                  ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 shadow-sm"
              }`}
            >
              <HugeiconsIcon icon={cat.icon} size={15} color="currentColor" />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;

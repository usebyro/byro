"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axiosInstance from "@/utils/axios";

interface Category {
  value: string;
  label: string;
  count: number;
}

const categoryGradients: Record<string, string> = {
  entertainment: "from-purple-700 via-purple-500 to-pink-400",
  web3_crypto: "from-amber-600 via-amber-500 to-orange-400",
  art_culture: "from-pink-600 via-pink-500 to-rose-400",
  conference: "from-emerald-700 via-emerald-600 to-teal-500",
  fitness: "from-orange-600 via-amber-500 to-yellow-400",
  technology: "from-indigo-700 via-indigo-500 to-violet-400",
  other: "from-gray-600 via-gray-500 to-slate-400",
};

// Override API labels with design-matching names
const categoryDisplayNames: Record<string, string> = {
  entertainment: "Concerts &\nLive Music",
  fitness: "Sports &\nMatches",
  art_culture: "Nightlife\n& Parties",
  conference: "Talks &\nConferences",
  web3_crypto: "Web3 &\nCrypto",
  technology: "Tech &\nInnovation",
  other: "Other\nEvents",
};

// SVG icon paths for each category
const CategoryIcon = ({ category }: { category: string }) => {
  switch (category) {
    case "entertainment":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "fitness":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      );
    case "art_culture":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "conference":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      );
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
  }
};

const BrowseByCategory = () => {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axiosInstance.get("events/categories/");
        const data = response.data;
        if (data.categories) {
          setCategories(data.categories);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const handleCategoryClick = (categoryValue: string) => {
    router.push(`/discover?category=${categoryValue}`);
  };

  if (loading) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-3 w-14 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-44 bg-gray-200 rounded mb-8" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-44 bg-gray-100 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Fallback categories if API returns nothing
  const displayCategories: Category[] =
    categories.length > 0
      ? categories.slice(0, 4)
      : [
          { value: "entertainment", label: "Entertainment", count: 0 },
          { value: "fitness", label: "Sports", count: 0 },
          { value: "art_culture", label: "Art & Culture", count: 0 },
          { value: "conference", label: "Conference", count: 0 },
        ];

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-blue-600 text-xs font-semibold uppercase tracking-widest mb-2">
              Browse
            </p>
            <h2 className="text-3xl font-bold text-gray-900">By category</h2>
          </div>
          <button
            onClick={() => router.push("/discover")}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
          >
            All categories
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {displayCategories.map((category) => {
            const displayName =
              categoryDisplayNames[category.value] || category.label;
            const lines = displayName.split("\n");

            return (
              <button
                key={category.value}
                onClick={() => handleCategoryClick(category.value)}
                className={`relative bg-gradient-to-br ${
                  categoryGradients[category.value] || "from-gray-600 to-gray-500"
                } rounded-2xl p-5 text-left text-white overflow-hidden group hover:scale-[1.02] active:scale-[0.99] transition-transform duration-200 shadow-md hover:shadow-lg aspect-[4/3] flex flex-col`}
              >
                {/* Icon container */}
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
                  <CategoryIcon category={category.value} />
                </div>

                {/* Name and count pushed to bottom */}
                <div className="mt-auto pt-4">
                  <h3 className="text-base font-bold leading-tight">
                    {lines.map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < lines.length - 1 && <br />}
                      </span>
                    ))}
                  </h3>
                  <p className="text-white/70 text-sm mt-1">
                    {category.count} events
                  </p>
                </div>

                {/* Decorative blur blob */}
                <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BrowseByCategory;

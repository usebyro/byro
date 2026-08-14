"use client";

import Link from "next/link";

const CommunitySection = () => {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Don&apos;t just sell tickets. Build your community.
        </h2>
        <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto mb-8 leading-relaxed">
          Create a space, host your events and keep talking to your people long
          after the night is over. Byro is built for organisers who want more
          than a guest list.
        </p>
        <Link
          href="/events/create"
          className="inline-flex items-center bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-blue-700 transition-colors"
        >
          Start for free
        </Link>
      </div>
    </section>
  );
};

export default CommunitySection;

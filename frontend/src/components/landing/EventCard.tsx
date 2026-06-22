"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import CheckoutModal from "@/components/checkout/CheckoutModal";

interface Event {
  id: number;
  slug: string;
  name: string;
  category: string;
  category_display?: string;
  day: string;
  time_from: string;
  time_to: string;
  location: string;
  ticket_price: number;
  event_image_url?: string;
  is_active: boolean;
  is_sold_out?: boolean;
}

const categoryGradients: Record<string, string> = {
  entertainment: "from-purple-700 via-purple-500 to-pink-500",
  web3_crypto: "from-amber-600 via-amber-500 to-orange-400",
  art_culture: "from-pink-700 via-pink-500 to-rose-400",
  conference: "from-emerald-700 via-emerald-600 to-teal-500",
  fitness: "from-orange-600 via-amber-500 to-yellow-400",
  technology: "from-indigo-700 via-indigo-500 to-violet-400",
  other: "from-gray-600 via-gray-500 to-slate-400",
};

const categoryDotColors: Record<string, string> = {
  entertainment: "bg-purple-300",
  web3_crypto: "bg-amber-300",
  art_culture: "bg-pink-300",
  conference: "bg-emerald-300",
  fitness: "bg-orange-300",
  technology: "bg-indigo-300",
  other: "bg-gray-300",
};

const categoryLabels: Record<string, string> = {
  entertainment: "CONCERTS & MUSIC",
  web3_crypto: "WEB3 & CRYPTO",
  art_culture: "NIGHTLIFE & PARTIES",
  conference: "CONFERENCES",
  fitness: "SPORTS",
  technology: "TECHNOLOGY",
  other: "OTHER",
};

const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return `${day} ${date.getDate()} ${month}`;
  } catch {
    return dateStr;
  }
};

const formatTime = (timeStr: string) => {
  try {
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(price);

const EventCard = ({ event }: { event: Event }) => {
  const [showCheckout, setShowCheckout] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isSoldOut = event.is_sold_out ?? false;
  const gradient = categoryGradients[event.category] || categoryGradients.other;
  const dotColor = categoryDotColors[event.category] || "bg-gray-300";
  const badgeLabel =
    event.category_display?.toUpperCase() ||
    categoryLabels[event.category] ||
    event.category.toUpperCase();
  const dateStr = formatDate(event.day);
  const timeStr = formatTime(event.time_from);

  return (
    <>
      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 group flex flex-col">
        {/* Image / gradient with overlaid content */}
        <Link href={`/${event.slug}`} className="block relative h-52 overflow-hidden flex-shrink-0">
          {event.event_image_url && !imageError ? (
            <Image
              src={event.event_image_url}
              alt={event.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
          )}

          {/* Bottom gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

          {/* Category badge — top left */}
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-white text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />
              {badgeLabel}
            </span>
          </div>

          {/* Heart — top right */}
          <button
            className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors"
            onClick={(e) => { e.preventDefault(); setSaved((s) => !s); }}
            aria-label={saved ? "Remove from saved" : "Save event"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={saved ? "#ef4444" : "none"}
              stroke={saved ? "#ef4444" : "currentColor"}
              strokeWidth="2"
              className={saved ? "" : "text-gray-600"}
              style={{ transition: "fill 0.15s, stroke 0.15s" }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* Event title — overlaid at bottom of image */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <h3 className="text-white font-bold text-lg leading-snug line-clamp-2">
              {event.name}
            </h3>
          </div>
        </Link>

        {/* Card body */}
        <div className="p-4 flex flex-col flex-1">
          <div className="space-y-1.5 mb-4 flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="flex-shrink-0"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>
                {dateStr} · {timeStr}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="flex-shrink-0"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">{event.location}</span>
            </div>
          </div>

          {/* Price + CTA */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                From
              </p>
              <p className="text-lg font-bold text-gray-900 leading-tight">
                {event.ticket_price === 0
                  ? "Free"
                  : formatPrice(event.ticket_price)}
              </p>
            </div>
            {isSoldOut ? (
              <span className="text-red-500 text-xs font-bold uppercase tracking-wide">
                SOLD OUT
              </span>
            ) : (
              <button
                onClick={() => setShowCheckout(true)}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-1 hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Get tickets
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutModal
          event={event}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </>
  );
};

export default EventCard;

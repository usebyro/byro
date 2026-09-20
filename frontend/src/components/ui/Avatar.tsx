"use client";

import { useState } from "react";

// Flat, soft tints (no gradients). Text is the 700 shade of each tint for contrast.
const TONES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-800",
  "bg-sky-100 text-sky-700",
];

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  /** Sizing, shape and text size, e.g. "w-10 h-10 rounded-full text-sm". */
  className?: string;
}

/**
 * A person's picture. Shows their photo when there is one, otherwise their
 * initials on a soft flat colour picked from their name (stable per person),
 * otherwise a plain person icon.
 */
export default function Avatar({ src, name, className = "w-10 h-10 rounded-full text-sm" }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && src !== failedSrc;
  const initials = initialsOf(name);
  const tone = TONES[hash((name || "").trim().toLowerCase()) % TONES.length];

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden shrink-0 select-none font-semibold ${
        showImage ? "bg-gray-100" : initials ? tone : "bg-gray-100 text-gray-500"
      } ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name ? `${name}` : ""}
          className="w-full h-full object-cover"
          onError={() => setFailedSrc(src as string)}
        />
      ) : initials ? (
        <span aria-hidden={name ? undefined : true}>{initials}</span>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-1/2 h-1/2" aria-hidden="true">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.14 0-7.5 2.24-7.5 5v1h15v-1c0-2.76-3.36-5-7.5-5Z" />
        </svg>
      )}
    </span>
  );
}

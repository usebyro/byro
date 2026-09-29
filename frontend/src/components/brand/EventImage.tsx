"use client";

import { useState } from "react";
import Image from "next/image";
import { categoryTone, eventInitials, type EventLike } from "@/lib/eventFormat";

interface EventImageProps {
  event: Pick<EventLike, "name" | "category" | "event_image_url">;
  sizes: string;
  priority?: boolean;
  className?: string;
}

/** Fills its (relative) parent with the event photo, or a tinted tile with initials when there is none. */
export default function EventImage({ event, sizes, priority, className = "" }: EventImageProps) {
  const [failed, setFailed] = useState(false);
  const tone = categoryTone(event.category);

  if (!event.event_image_url || failed) {
    return (
      <div
        className={`absolute inset-0 flex items-center justify-center ${className}`}
        style={{ background: tone.bg }}
        aria-hidden="true"
      >
        <span className="font-display text-6xl font-bold opacity-60" style={{ color: tone.ink }}>
          {eventInitials(event.name)}
        </span>
      </div>
    );
  }

  const local = /localhost|127\.0\.0\.1/.test(event.event_image_url);
  return (
    <Image
      src={event.event_image_url}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={local}
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

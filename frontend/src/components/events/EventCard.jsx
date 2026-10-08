import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { IoLocationSharp } from "react-icons/io5";
import { useSelector } from "react-redux";


const EventCard = ({ event }) => {
  const [imageError, setImageError] = useState(false);
  const authenticated = useSelector((state) => !!state.auth?.token);

  const getImageUrl = () => {
    if (imageError) {
      return "/assets/images/default-event.jpg";
    }

    if (event.event_image_url) {
      return event.event_image_url;
    }

    if (!event.event_image) {
      return "/assets/images/default-event.jpg";
    }

    if (event.event_image.startsWith("http")) {
      return event.event_image;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://byro.onrender.com";
    const base = apiBase.replace(/\/api\/?$/, "");
    return `${base}${event.event_image}`;
  };

  const eventId = event.id || event._id;
  const eventTitle = event.title || event.name;
  const eventDate = event.day || event.startDate || event.eventDate;
  const time = event?.time_from;
  const eventLocation = event.location || event.venue;
  const eventHost = event.host || event.organizer || "Host Name";
  const eventPrice = event.price || event.ticketPrice || 0;
  const isFree = event.isFree || eventPrice === 0;
  const eventSlug = event.slug || eventId;
  const eventType = event.eventType || event.type || "ONLINE EVENT";

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Link href={`/discover/${eventSlug}`} className="block group">
      <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 p-2 sm:p-3">
        <div className="relative h-40 sm:h-48 w-full overflow-hidden rounded-lg">
          <Image
            src={getImageUrl()}
            alt={eventTitle || "Event"}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={() => setImageError(true)}
            priority={false}
            loading="lazy"
            quality={75}
          />

          {authenticated && (
            <div className="absolute top-2 left-2">
              <span
                className={`${
                  isFree
                    ? "bg-[#007AFF] text-white"
                    : "bg-[#D9EBFF] text-[#007AFF]"
                } backdrop-blur-sm px-2 sm:px-3 py-1 rounded-[5px] text-[9px] sm:text-[10px] font-semibold`}
              >
                {isFree ? "Going" : `Manage`}
              </span>
            </div>
          )}
        </div>

        <div className="p-2 sm:p-3">
          <h3 className="font-semibold text-sm sm:text-base text-gray-900 mb-2 sm:mb-3 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {eventTitle}
          </h3>

          <p className="text-blue-600 text-xs sm:text-sm font-medium mb-3 sm:mb-4">
            {formatDate(eventDate)}
          </p>

          <div className="flex items-center gap-1">
            <div className="shrink-0">
              <IoLocationSharp size={14} className="sm:w-[15px] sm:h-[15px] text-[#007AFF]" />
            </div>
            <p className="text-[#7E7E7E] text-[11px] sm:text-[12px] truncate">
              {isFree ? eventLocation : "Event hosted by you"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default EventCard;

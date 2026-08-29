"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FaWhatsapp,
  FaXTwitter,
  FaFacebookF,
  FaTelegram,
  FaLinkedinIn,
  FaLink,
} from "react-icons/fa6";
import { withShareUtm } from "@/lib/analytics";

/**
 * Shown once, right after an event is published. Every share link is
 * stamped with utm_source=<channel> so we know which one actually drove
 * signups — same attribution approach as ShareMenu, just surfaced as a
 * full moment instead of a dropdown, since this is the single highest-
 * intent point to ask an organiser to share.
 */
export default function EventPublishedModal({ event, onClose }) {
  const [copied, setCopied] = useState(false);

  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://usebyro.com").replace(/\/+$/, "");
  const url = `${SITE_URL}/discover/${event.slug}`;
  const title = event.name || "my event";

  const link = (source) => withShareUtm(url, "event_share", event.slug, source, source);

  const openWindow = (href) => window.open(href, "_blank", "noopener,noreferrer");

  const channels = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: FaWhatsapp,
      color: "#25D366",
      onClick: () =>
        openWindow(`https://wa.me/?text=${encodeURIComponent(`${title} ${link("whatsapp")}`.trim())}`),
    },
    {
      key: "twitter",
      label: "X",
      icon: FaXTwitter,
      color: "#000000",
      onClick: () =>
        openWindow(
          `https://twitter.com/intent/tweet?url=${encodeURIComponent(link("twitter"))}&text=${encodeURIComponent(title)}`
        ),
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: FaFacebookF,
      color: "#1877F2",
      onClick: () =>
        openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link("facebook"))}`),
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: FaTelegram,
      color: "#26A5E4",
      onClick: () =>
        openWindow(
          `https://t.me/share/url?url=${encodeURIComponent(link("telegram"))}&text=${encodeURIComponent(title)}`
        ),
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      icon: FaLinkedinIn,
      color: "#0A66C2",
      onClick: () =>
        openWindow(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link("linkedin"))}`),
    },
  ];

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(link("copy_link"))
      .then(() => {
        setCopied(true);
        toast.success("Link copied!");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error("Couldn't copy the link."));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1.5">You&apos;re live! Time to fill the room.</h2>
        <p className="text-sm text-gray-500 mb-6">
          Share your link now — early shares get your first ticket sales.
        </p>

        <div className="flex items-center justify-center gap-3 mb-5">
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <button
                key={channel.key}
                type="button"
                onClick={channel.onClick}
                aria-label={`Share on ${channel.label}`}
                title={channel.label}
                className="w-11 h-11 rounded-full flex items-center justify-center border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <Icon size={18} color={channel.color} />
              </button>
            );
          })}
        </div>

        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden mb-5">
          <span className="flex-1 px-4 py-2.5 text-sm text-gray-600 truncate text-left">{url}</span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-gray-700 border-l border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
          >
            <FaLink size={12} color={copied ? "#10b981" : "#6B7280"} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          I&apos;ll share later
        </button>
      </div>
    </div>
  );
}

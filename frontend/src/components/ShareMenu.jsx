"use client";

import { useState, useRef, useEffect } from "react";
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
 * Per-platform share menu. Each entry opens that platform's own share intent
 * so we know exactly which channel was used and can stamp utm_source=<platform>
 * — the native OS share sheet can't tell us the target, so this is the only way
 * to attribute shares per channel.
 *
 * Props:
 *   url       — the canonical URL being shared (without UTM)
 *   title     — text/title passed to platforms that accept it
 *   campaign  — utm_campaign (e.g. "event_share", "profile_share")
 *   content   — utm_content (event slug / username)
 *   onShare   — optional callback fired with the chosen channel (for analytics)
 *   className — extra classes for the trigger button
 *   children  — trigger button contents (icon/label)
 */
export default function ShareMenu({
  url,
  title = "",
  campaign,
  content,
  onShare,
  className = "",
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const link = (source) => withShareUtm(url, campaign, content, source, source);

  const openWindow = (href) => {
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const channels = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: FaWhatsapp,
      color: "#25D366",
      onClick: () =>
        openWindow(
          `https://wa.me/?text=${encodeURIComponent(`${title} ${link("whatsapp")}`.trim())}`
        ),
    },
    {
      key: "twitter",
      label: "X (Twitter)",
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
        openWindow(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link("facebook"))}`
        ),
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
        openWindow(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link("linkedin"))}`
        ),
    },
    {
      key: "copy",
      label: "Copy link",
      icon: FaLink,
      color: "#6B7280",
      onClick: () => {
        navigator.clipboard
          .writeText(link("copy_link"))
          .then(() => toast.success("Link copied!"))
          .catch(() => toast.error("Couldn't copy the link."));
      },
    },
  ];

  const handlePick = (channel) => {
    channel.onClick();
    onShare?.(channel.key);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
      >
        {children}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-xl p-1.5 z-50"
        >
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <button
                key={channel.key}
                type="button"
                role="menuitem"
                onClick={() => handlePick(channel)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Icon size={16} color={channel.color} />
                {channel.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

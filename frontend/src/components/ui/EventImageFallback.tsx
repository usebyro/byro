import type { ComponentType, SVGProps } from "react";
import {
  FaMusic,
  FaFutbol,
  FaMoon,
  FaMicrophoneLines,
  FaMicrochip,
  FaCubes,
  FaCalendarDays,
} from "react-icons/fa6";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// One flat colour per category. `soft` is for thumbnails and cards on white;
// `solid` is for banners that carry white text on top of the image slot.
const CATEGORIES: Record<string, { icon: Icon; soft: string; solid: string }> = {
  entertainment: { icon: FaMusic,            soft: "bg-purple-100 text-purple-400", solid: "bg-purple-800" },
  fitness:       { icon: FaFutbol,           soft: "bg-orange-100 text-orange-400", solid: "bg-orange-800" },
  art_culture:   { icon: FaMoon,             soft: "bg-rose-100 text-rose-400",     solid: "bg-rose-800" },
  conference:    { icon: FaMicrophoneLines,  soft: "bg-teal-100 text-teal-500",     solid: "bg-teal-800" },
  technology:    { icon: FaMicrochip,        soft: "bg-indigo-100 text-indigo-400", solid: "bg-indigo-800" },
  web3_crypto:   { icon: FaCubes,            soft: "bg-amber-100 text-amber-500",   solid: "bg-amber-800" },
  other:         { icon: FaCalendarDays,     soft: "bg-slate-100 text-slate-400",   solid: "bg-slate-700" },
};

interface Props {
  category?: string | null;
  /** "soft" for thumbnails and cards on white, "solid" behind white overlay text. */
  tone?: "soft" | "solid";
  className?: string;
}

/**
 * What an event shows when it has no image: a flat category colour with the
 * category's icon. Fills its (relatively positioned) parent.
 */
export default function EventImageFallback({ category, tone = "soft", className = "" }: Props) {
  const entry = CATEGORIES[category || "other"] || CATEGORIES.other;
  const Icon = entry.icon;

  if (tone === "solid") {
    return (
      <div className={`w-full h-full flex items-center justify-center ${entry.solid} ${className}`} aria-hidden="true">
        <Icon className="h-1/3 w-auto text-white/10" />
      </div>
    );
  }
  return (
    <div className={`w-full h-full flex items-center justify-center ${entry.soft} ${className}`} aria-hidden="true">
      <Icon className="h-[38%] w-auto" />
    </div>
  );
}

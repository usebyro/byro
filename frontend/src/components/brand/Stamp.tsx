import type { CSSProperties } from "react";

export const STAMP_INK = {
  blue: "#3669F6",
  pink: "#D0668E",
  gold: "#C9971C",
  green: "#2F9E6E",
} as const;

export type StampInk = keyof typeof STAMP_INK;

interface StampProps {
  name: string;
  city: string;
  date: string;
  ink?: StampInk;
  shape?: "round" | "square";
  size?: number;
  tilt?: number;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A passport stamp: double border, city, event name and date. Decorative unless the parent labels it. */
export default function Stamp({
  name,
  city,
  date,
  ink = "blue",
  shape = "round",
  size = 112,
  tilt = 0,
  filled = false,
  className = "",
  style,
}: StampProps) {
  const color = STAMP_INK[ink];
  const small = Math.max(6, Math.round(size * 0.08));
  const title = Math.max(9, Math.round(size * 0.134));
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${className}`}
      style={{
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: shape === "round" ? "50%" : Math.round(size * 0.18),
        border: `${Math.max(3, Math.round(size * 0.036))}px double ${color}`,
        color: color,
        background: filled ? "#FFFFFF" : "transparent",
        padding: Math.round(size * 0.07),
        gap: Math.round(size * 0.03),
        transform: `rotate(${tilt}deg)`,
        ...style,
      }}
    >
      <span style={{ fontSize: small, fontWeight: 800, letterSpacing: "0.14em" }}>{city}</span>
      <span
        className="font-display"
        style={{ fontSize: title, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.01em" }}
      >
        {name}
      </span>
      <span style={{ fontSize: small, fontWeight: 800, letterSpacing: "0.1em" }}>{date}</span>
    </div>
  );
}

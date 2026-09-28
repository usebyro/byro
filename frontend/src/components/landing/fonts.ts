import { Bricolage_Grotesque } from "next/font/google";

export const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-hero-display",
  axes: ["opsz", "wdth"],
});

export const displayStyle = {
  fontFamily: "var(--font-hero-display), sans-serif",
  fontVariationSettings: "'wdth' 85",
} as const;

import { displayFont } from "@/components/brand/fonts";

/** Kept so older imports keep working; the font variables now live on <body>. */
export const display = displayFont;
export const displayStyle = { fontFamily: "var(--font-display), sans-serif" } as const;

import { Bricolage_Grotesque, Nunito_Sans } from "next/font/google";

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz"],
});

export const bodyFont = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  axes: ["opsz"],
});

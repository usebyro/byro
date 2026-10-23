import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  // A form, not a page to find: keeps "Sign in" out of the sitelinks under Byro's search result.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata, Viewport } from "next";
import AdminShell from "./AdminShell";

// Its own manifest so "Add to Home Screen" makes a "Byro Admin" app that opens the admin
// (on iPhone, push notifications only work from a Home Screen app).
export const metadata: Metadata = {
  // Internal only. The middleware also sends X-Robots-Tag: noindex on every admin response.
  robots: { index: false, follow: false },
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Byro Admin", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#FFFFFF" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

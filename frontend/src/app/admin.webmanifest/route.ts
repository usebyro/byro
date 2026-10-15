// The admin's web app manifest. The admin lives at admin.usebyro.com/ or usebyro.com/admin/,
// so where the installed app opens depends on the host it was added from.
export function GET(request: Request) {
  const host = request.headers.get("host") || "";
  const base = host.startsWith("admin.") ? "/" : "/admin/";
  return Response.json(
    {
      name: "Byro Admin",
      short_name: "Byro Admin",
      id: base,
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#FFFFFF",
      theme_color: "#FFFFFF",
      icons: [
        { src: "/favicon_io/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/favicon_io/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}

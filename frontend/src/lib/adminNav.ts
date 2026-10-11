// The admin section is served either under the "admin." subdomain (where
// middleware.ts rewrites "/events" -> "/admin/events" internally) or
// directly under "/admin/*" on the main domain (e.g. localhost, or
// usebyro.com/admin). Compute the right href for whichever context we're
// currently in so admin links don't accidentally point at the public site.
export function resolveAdminHref(pathname: string, href: string) {
  const onAdminPath = pathname.startsWith("/admin");
  if (!onAdminPath) return href; // subdomain: middleware handles the rewrite
  return href === "/" ? "/admin" : `/admin${href}`;
}

// Public pages (events, profiles) live on the main domain. From the "admin."
// subdomain a relative link would stay on the admin host, so point at the
// main domain instead. Elsewhere (localhost, usebyro.com/admin) relative works.
export function publicHref(path: string) {
  if (typeof window === "undefined") return path;
  const { protocol, hostname, port } = window.location;
  if (!hostname.startsWith("admin.")) return path;
  return `${protocol}//${hostname.slice("admin.".length)}${port ? `:${port}` : ""}${path}`;
}

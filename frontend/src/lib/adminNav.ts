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

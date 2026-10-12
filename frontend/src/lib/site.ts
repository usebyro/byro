/**
 * The site's public address, used for canonical URLs, the sitemap and structured data.
 *
 * The site is served from www.usebyro.com; the bare domain redirects there. Canonical and sitemap
 * URLs have to be the address that actually answers, so a bare-domain setting is turned into www.
 */
const configured = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.usebyro.com").replace(/\/+$/, "");

export const SITE_URL = configured.replace(/^(https?:\/\/)usebyro\.com$/i, "$1www.usebyro.com");

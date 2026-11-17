/**
 * A same-site path that is safe to send someone to after sign-in, or null.
 *
 * "Starts with / and not //" is not enough: browsers read a backslash as a slash, so "/\evil.com" goes to
 * evil.com, and tabs or newlines inside the address are dropped before it is read. The path is resolved
 * against a placeholder site and accepted only if it stays on that site.
 */
const PLACEHOLDER = "https://same-site.invalid";

export function safeRedirect(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, PLACEHOLDER);
    if (url.origin !== PLACEHOLDER) return null;
    const path = url.pathname + url.search + url.hash;
    // Resolving "." and ".." can leave a path that starts with "//" ("/..//evil.com" becomes "//evil.com"),
    // which a browser reads as another site, so the result is held to the same rules as the input.
    if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}

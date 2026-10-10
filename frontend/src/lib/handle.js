/** A community address: letters, numbers, underscores and hyphens (matches the server's rule). */
export const HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Suggest an address from a name: "Lagos Run Club" -> "lagos-run-club". */
export function slugifyHandle(name) {
  return (name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Message for a handle that can't be used, or "" when it looks fine. */
export function handleProblem(handle) {
  const h = (handle || "").trim();
  if (!h) return "Choose a username for your page.";
  if (h.length < 3) return "Use at least 3 characters.";
  if (!HANDLE_PATTERN.test(h)) return "Use only letters, numbers, hyphens and underscores.";
  return "";
}

/** Turn the server's "handle: This handle is already taken." into plain words. */
export function friendlyProfileError(err) {
  const msg = (err && err.message) || "";
  if (/already taken/i.test(msg)) return "That username is taken. Try another.";
  if (/handle/i.test(msg)) return msg.replace(/^handle:\s*/i, "");
  return msg || "We couldn't save that. Please try again.";
}

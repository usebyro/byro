import { useSelector } from "react-redux";
import { useHydrated } from "@/lib/useHydrated";

const SIGNED_OUT = { user: null, token: null, isAuthenticated: false };

/**
 * The saved login, once the browser has it. Pages are rendered on the server, which can't see
 * the login, so until hydration everyone looks signed out. `ready` tells login-only pages when
 * a missing token really means "not signed in" (and it's safe to send them to /login).
 */
export function useAuth() {
  const ready = useHydrated();
  const auth = useSelector((s) => s.auth);
  return ready ? { ...auth, ready } : { ...SIGNED_OUT, ready };
}

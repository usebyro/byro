"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/redux/useAuth";
import { CONSENT_SAVED_EVENT, readConsent } from "@/lib/consent";
import { isStaffArea, setAnalyticsDisabled, setAnalyticsUserId } from "@/lib/analytics";

/**
 * Two jobs, both about who is in the data:
 *  - Staff pages (admin.usebyro.com, /admin/*) send nothing to GA.
 *  - A signed-in visitor who allowed analytics gets GA's user_id set to our internal id (never an email
 *    or phone). Signing out, or withdrawing consent, clears it.
 */
export default function AnalyticsGate() {
  const pathname = usePathname();
  const { user, isAuthenticated, ready } = useAuth();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);

  useEffect(() => {
    const sync = () => setAnalyticsAllowed(readConsent()?.analytics === true);
    sync();
    window.addEventListener(CONSENT_SAVED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_SAVED_EVENT, sync);
  }, []);

  const staff = typeof window !== "undefined" && isStaffArea(window.location.hostname, pathname || "");
  useEffect(() => {
    setAnalyticsDisabled(staff);
  }, [staff]);

  const id = ready && isAuthenticated && user?.id != null ? user.id : null;
  useEffect(() => {
    if (!ready) return;
    setAnalyticsUserId(!staff && analyticsAllowed ? id : null);
    // gtag.js may still be loading: events are queued, and the set() is replayed with them.
  }, [ready, id, staff, analyticsAllowed]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import NotificationList, { useNotifications } from "@/components/dashboard/NotificationList";

// Phones: the bell opens this full-screen list instead of a dropdown.
export default function NotificationsPage() {
  const state = useNotifications();
  const router = useRouter();

  useEffect(() => {
    document.title = "Notifications | Byro";
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col bg-white md:my-6 md:rounded-[20px] md:border md:border-line">
      <div className="flex h-[52px] items-center px-2 md:hidden">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard/overview"))}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-full border-0 bg-transparent text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
      </div>
      <NotificationList state={state} inset="px-4 md:px-5" />
    </div>
  );
}

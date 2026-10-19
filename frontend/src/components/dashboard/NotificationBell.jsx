"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification01Icon } from "@hugeicons/core-free-icons";
import NotificationList, { useNotifications } from "./NotificationList";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const state = useNotifications();
  const { unread } = state;
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const bell = buttonRef.current;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      bell?.focus();
    };
  }, [open]);

  // Phones get the full-screen page; the dropdown is for wider screens.
  const toggle = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      router.push("/dashboard/notifications");
      return;
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border-0 bg-[#EEF3FF] text-ink transition-colors hover:bg-[#E2EAFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <HugeiconsIcon icon={Notification01Icon} size={20} color="currentColor" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#D92D20] px-[5px] text-[10px] font-extrabold leading-none text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 flex max-h-[min(720px,calc(100dvh-96px))] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_24px_60px_rgba(20,22,28,0.16)] focus:outline-none"
        >
          <NotificationList state={state} onNavigate={() => setOpen(false)} />
        </section>
      )}
    </div>
  );
}

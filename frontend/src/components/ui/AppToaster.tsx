"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Toaster } from "sonner";

/**
 * The app's toasts, in the design: one dark card, with a round icon that says what kind it is,
 * a bold title, an optional grey line, an optional blue action, and a dismiss button.
 *
 * Bottom right on desktop, full width at the top on phones (so thumbs and bottom nav stay clear).
 * Stays 4 seconds and pauses on hover, shows at most 3, and loading toasts stay until they are updated.
 * Call sites keep using `toast.success(...)` etc. from "sonner"; nothing else needs to change.
 */

const Mark = ({ bg, children }: { bg: string; children: ReactNode }) => (
  <span aria-hidden="true" className="flex h-[26px] w-[26px] items-center justify-center rounded-full" style={{ background: bg }}>
    {children}
  </span>
);

const Stroke = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  success: (
    <Mark bg="#2F9E6E">
      <Stroke d="M5 12l5 5L20 7" />
    </Mark>
  ),
  error: (
    <Mark bg="#D92D20">
      <Stroke d="M12 7v6M12 17h.01" />
    </Mark>
  ),
  warning: (
    <Mark bg="#C9971C">
      <Stroke d="M12 7v6M12 17h.01" />
    </Mark>
  ),
  info: (
    <Mark bg="#3669F6">
      <Stroke d="M12 11v6M12 7h.01" />
    </Mark>
  ),
  loading: (
    <span
      aria-hidden="true"
      className="box-border block h-[26px] w-[26px] animate-spin rounded-full border-[3px] border-white/25 border-t-white motion-reduce:animate-none"
    />
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
};

const classNames = {
  // Same width every time (Sonner only sets it when styled); phones get full width from Sonner's own rules.
  toast:
    "flex w-[380px] items-center gap-3 rounded-2xl bg-[#14161C] py-3 pl-3.5 pr-2.5 font-body text-white shadow-[0_12px_32px_rgba(20,22,28,0.22)]",
  icon: "!m-0 flex shrink-0 items-center justify-center",
  // Sonner floats its spinner in the middle of the toast; keep it in the row like the other icons.
  loader: "!relative !left-0 !top-0 !h-[26px] !w-[26px] !transform-none",
  content: "flex min-w-0 flex-1 flex-col gap-px",
  title: "text-sm font-extrabold leading-snug",
  description: "text-[13px] leading-snug text-white/70",
  actionButton:
    "shrink-0 rounded-lg bg-transparent px-2 py-1.5 text-sm font-extrabold text-[#9DB8FF] transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
  cancelButton:
    "shrink-0 rounded-lg bg-transparent px-2 py-1.5 text-sm font-bold text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
  // The dismiss button sits on the right, after any action.
  closeButton:
    "order-last flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
};

const PHONE = "(max-width: 600px)";
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

export default function AppToaster() {
  const isPhone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);

  return (
    <Toaster
      position={isPhone ? "top-center" : "bottom-right"}
      duration={4000}
      visibleToasts={3}
      expand
      gap={10}
      // Bottom right sits above the live-chat bubble, so it never covers a toast's action or dismiss button.
      offset={{ right: 24, bottom: 104 }}
      mobileOffset={{ top: 16, left: 16, right: 16 }}
      closeButton
      icons={ICONS}
      toastOptions={{ unstyled: true, classNames }}
      style={{ "--width": "380px" } as CSSProperties}
    />
  );
}

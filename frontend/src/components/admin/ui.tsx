"use client";

/**
 * Shared building blocks for the Byro admin: buttons, status badges, and the confirm dialog.
 * Use these instead of styling buttons or calling window.confirm/prompt on each page, so every
 * page looks and behaves the same.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-line bg-white text-ink hover:bg-mist",
  danger: "bg-danger-strong text-white hover:bg-danger",
  ghost: "text-muted hover:bg-mist hover:text-ink",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows "…" after the label and disables the button while an action runs. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, className = "", disabled, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition-[background-color,color,scale] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
      {loading && <span aria-hidden="true">…</span>}
    </button>
  );
});

/* ------------------------------------------------------------ status badges */

export type Tone = "good" | "waiting" | "problem" | "neutral" | "info";

const TONE: Record<Tone, string> = {
  good: "bg-good-tint text-good",
  waiting: "bg-waiting-tint text-waiting",
  problem: "bg-danger-tint text-danger",
  neutral: "bg-mist text-muted",
  info: "bg-sky text-brand-dark",
};

/** A small pill for a state. One meaning per tone: good, waiting, problem, neutral, info. */
export function StatusBadge({ tone, children, className = "" }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Which tone a common status word should get, so the same word looks the same on every page. */
export function toneFor(status: string | null | undefined): Tone {
  switch ((status || "").toLowerCase()) {
    case "successful": case "paid": case "processed": case "sent": case "resolved": case "active": case "valid": case "free":
      return "good";
    case "pending": case "scheduled": case "sending": case "processing": case "submitting": case "awaiting": case "open": case "unpaid":
      return "waiting";
    case "failed": case "rejected": case "needs_attention": case "suspended": case "cancelled_by_admin": case "abandoned":
      return "problem";
    default:
      return "neutral";
  }
}

/* ----------------------------------------------------------- confirm dialog */

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for permanent or harmful actions: a red button, and Cancel is focused first. */
  tone?: "primary" | "danger";
  /** Ask for text too (e.g. a reason). The promise then resolves with the text. */
  input?: { label: string; placeholder?: string; required?: boolean; multiline?: boolean; maxLength?: number };
}

type Pending = ConfirmOptions & { resolve: (value: boolean | string | null) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean | string | null>) | null>(null);

/**
 * `const confirm = useConfirm();`
 * `if (!(await confirm({ title, body, confirmLabel: "Suspend", tone: "danger" }))) return;`
 * With `input`, it resolves to the typed text (or null when cancelled).
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean | string | null>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const close = useCallback(
    (value: boolean | string | null) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog key={pending.title} options={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (v: boolean | string | null) => void }) {
  const { title, body, confirmLabel, cancelLabel = "Cancel", tone = "primary", input } = options;
  const titleId = useId();
  const bodyId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const missing = Boolean(input?.required && !text.trim());

  // Focus: the text box if there is one, else Cancel for danger (safer default), else the main button.
  // Escape cancels; Tab stays inside the dialog; focus goes back where it was on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    (input ? fieldRef.current : tone === "danger" ? cancelRef.current : confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(input ? null : false);
      }
      if (e.key === "Tab" && box.current) {
        const items = box.current.querySelectorAll<HTMLElement>("button, textarea, input");
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [input, tone, onClose]);

  const submit = () => {
    if (missing) return;
    onClose(input ? text.trim() : true);
  };

  const fieldClass =
    "w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-ink/45 animate-scrim-in motion-reduce:animate-none" onClick={() => onClose(input ? null : false)} />
      <div
        ref={box}
        role={tone === "danger" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(20,22,28,0.18)] animate-dialog-in motion-reduce:animate-none"
      >
        <h2 id={titleId} className="font-display text-lg font-bold leading-snug text-ink text-balance">
          {title}
        </h2>
        {body && (
          <div id={bodyId} className="mt-2 text-sm leading-relaxed text-body text-pretty">
            {body}
          </div>
        )}
        {input && (
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-bold text-ink">
            {input.label}
            {input.multiline ? (
              <textarea
                ref={fieldRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={input.maxLength ?? 300}
                placeholder={input.placeholder}
                className={`${fieldClass} resize-none py-2.5 font-normal`}
              />
            ) : (
              <input
                ref={fieldRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                maxLength={input.maxLength ?? 300}
                placeholder={input.placeholder}
                autoComplete="off"
                className={`${fieldClass} h-11 font-normal`}
              />
            )}
          </label>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={() => onClose(input ? null : false)}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={tone === "danger" ? "danger" : "primary"} onClick={submit} disabled={missing}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- skeletons */

/** Grey placeholder rows shaped like a list, shown while it loads (instead of "Loading…" or an empty table). */
export function SkeletonRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col divide-y divide-hairline">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3.5">
          <span className="h-9 w-9 shrink-0 rounded-full bg-mist animate-pulse motion-reduce:animate-none" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 rounded-full bg-mist animate-pulse motion-reduce:animate-none" style={{ width: `${55 - (i % 3) * 12}%` }} />
            <span className="h-2.5 w-1/4 rounded-full bg-mist animate-pulse motion-reduce:animate-none" />
          </span>
          <span className="h-3 w-16 shrink-0 rounded-full bg-mist animate-pulse motion-reduce:animate-none" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** A grey placeholder card for a page section. */
export function SkeletonCard({ className = "h-40" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-white border border-line p-6 ${className}`}><div className="h-full w-full rounded-lg bg-mist animate-pulse motion-reduce:animate-none" /></div>;
}

/* -------------------------------------------------------------- side panel */

/**
 * A panel that slides in from the right, for looking at one thing (a user, an event).
 * Escape or the backdrop closes it, focus moves into it and goes back where it was,
 * Tab stays inside, and the page behind doesn't scroll.
 */
export function SidePanel({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // A confirm dialog opened on top owns the keyboard; the panel waits until it closes.
      if (!panel.current?.contains(document.activeElement)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40 animate-scrim-in motion-reduce:animate-none" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-md flex-col overscroll-contain bg-white shadow-[0_20px_50px_rgba(20,22,28,0.16)] animate-panel-in motion-reduce:animate-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate font-display text-lg font-bold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- dates */

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "14 Oct 2026" — one date style across the admin. */
export function fmtDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

/** "14 Oct 2026, 15:40" */
export function fmtDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

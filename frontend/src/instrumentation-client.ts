import type * as SentryType from "@sentry/nextjs";
import { applyConsent, readConsent } from "@/lib/consent";

// Sentry's browser SDK is about 80 KB of script. Loaded with the page it delays what visitors see on a
// phone, so it starts once the browser is idle (at most 3 seconds in). Errors in that first moment aren't
// reported; everything after is.
let sentry: typeof SentryType | null = null;

function start() {
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: "https://ef3720d6bc5ec52a412a8c8417353314@o4511786643488768.ingest.de.sentry.io/4511786654826576",

      // Session replay is added in lib/consent.ts once the visitor accepts analytics cookies.

      tracesSampleRate: 1,
      enableLogs: true,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      dataCollection: {},
    });
    sentry = Sentry;
    // A returning visitor's choice was applied before Sentry existed, so apply it again now.
    const saved = readConsent();
    if (saved) applyConsent(saved);
  });
}

if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 2000);
}

export const onRouterTransitionStart = (...args: Parameters<typeof SentryType.captureRouterTransitionStart>) =>
  sentry?.captureRouterTransitionStart(...args);

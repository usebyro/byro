import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://ef3720d6bc5ec52a412a8c8417353314@o4511786643488768.ingest.de.sentry.io/4511786654826576",

  // Session replay is added in lib/consent.ts once the visitor accepts analytics cookies.

  tracesSampleRate: 1,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  dataCollection: {},
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Stands in for "@sentry/nextjs" on the server of the Cloudflare build only (see next.config.ts).
// The real server SDK is ~8 MB of script, and Cloudflare Workers cap the script at 3 MB (free) or 10 MB (paid).
// Browsers still get the real SDK, so client errors are reported as before.
/* eslint-disable @typescript-eslint/no-explicit-any */
const noop = () => {};
export const init = noop;
export const captureException = noop;
export const captureMessage = noop;
export const captureRequestError = noop;
export const flush = async () => true;
export const diagnoseSdkConnectivity = async () => undefined;
export const startSpan = (_options: any, callback: (span: any) => any) => callback({});
export const logger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, fmt: (s: any) => s };

import * as Sentry from "@sentry/nextjs";

let initialized = false;

/**
 * DumosRx ships as a statically-exported Next.js app (Tauri bundles the
 * static output, no Next.js server/edge runtime) — so only the browser SDK
 * applies here. Performance monitoring and session replay are deferred to a
 * later pass; this ships error capture only.
 */
export function initSentry() {
  if (initialized || typeof window === "undefined") return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });

  initialized = true;
}

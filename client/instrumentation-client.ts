// Auto-loaded by Next.js on every page load in the browser — this app is a
// static export (Tauri-bundled desktop/mobile, and FTP-deployed as-is to
// app.dumosrx.com) with no server/edge runtime at all, so only this client
// file applies; there is deliberately no sentry.server.config.ts /
// sentry.edge.config.ts / instrumentation.ts.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",

    // Performance monitoring and session replay are deliberately deferred —
    // ship error capture only for this pass.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // The app already has a single deliberate crash choke point
    // (logCrash() in lib/utils/error-logger.ts) that logs locally first
    // (offline-first: the feedback table survives with no network) and
    // only then forwards to Sentry — everything routes through there
    // rather than scattering captureException calls or letting Sentry's
    // own automatic global error/rejection handlers fire independently,
    // which would otherwise double-report every uncaught error (once from
    // Sentry's default GlobalHandlers integration, once from logCrash).
    integrations: (defaultIntegrations) =>
      defaultIntegrations.filter((integration) => integration.name !== "GlobalHandlers"),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

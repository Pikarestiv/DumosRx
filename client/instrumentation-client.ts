// Auto-loaded by Next.js on every page load in the browser.
// Rationale: docs/CLIENT_COMMENTS.md#line-instrumentation-client-ts-L1

import * as Sentry from "@sentry/nextjs";
import { resolveSentryGating } from "@/lib/utils/sentry-config";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Off on a developer's machine, sampled on the deployed dev build, full rate in production.
// Rationale: docs/CLIENT_COMMENTS.md#line-instrumentation-client-ts-L12
const gating = resolveSentryGating(
  dsn,
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  process.env.NODE_ENV,
);

if (gating.enabled) {
  Sentry.init({
    dsn,
    environment: gating.environment,
    sampleRate: gating.sampleRate,

    // Performance monitoring and session replay are deliberately deferred:
    // ship error capture only for this pass.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // The app already has a single deliberate crash choke point (logCrash() in lib/utils/error-logger.ts) that logs locally fi…
    // Rationale: docs/CLIENT_COMMENTS.md#line-instrumentation-client-ts-L33
    integrations: (defaultIntegrations) =>
      defaultIntegrations.filter((integration) => integration.name !== "GlobalHandlers"),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

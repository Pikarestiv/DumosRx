/**
 * The one place that decides whether this build reports to Sentry, and at
 * what rate. Rationale and the per-environment table: client/AGENTS.md,
 * "What reaches Sentry".
 */

export const SENTRY_DEV_SAMPLE_RATE = 0.1;

export const LOCAL_SENTRY_ENVIRONMENT = "local";

export interface SentryGating {
  enabled: boolean;
  environment: string;
  sampleRate: number;
}

export function resolveSentryGating(
  dsn: string | undefined,
  environment: string | undefined,
  nodeEnv: string | undefined,
): SentryGating {
  const resolved = environment || LOCAL_SENTRY_ENVIRONMENT;

  return {
    enabled:
      Boolean(dsn) &&
      nodeEnv !== "development" &&
      resolved !== LOCAL_SENTRY_ENVIRONMENT,
    environment: resolved,
    sampleRate: resolved === "production" ? 1 : SENTRY_DEV_SAMPLE_RATE,
  };
}

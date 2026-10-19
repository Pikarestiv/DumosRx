import { describe, it, expect } from "vitest";
import { resolveSentryGating } from "@/lib/utils/sentry-config";

const DSN = "https://key@o1.ingest.us.sentry.io/1";

/**
 * Sentry is off on a developer's machine, sampled on the deployed dev build,
 * and full-rate in production. The two "off" cases are the point.
 */
describe("resolveSentryGating", () => {
  it("is off with no DSN", () => {
    expect(resolveSentryGating(undefined, "production", "production").enabled).toBe(false);
    expect(resolveSentryGating("", "production", "production").enabled).toBe(false);
  });

  it("is off under `next dev`", () => {
    expect(resolveSentryGating(DSN, "production", "development").enabled).toBe(false);
  });

  it("is off for a local build that names no environment, and never calls it production", () => {
    const gating = resolveSentryGating(DSN, undefined, "production");

    expect(gating.enabled).toBe(false);
    expect(gating.environment).toBe("local");
  });

  it("is on and fully sampled in production", () => {
    expect(resolveSentryGating(DSN, "production", "production")).toEqual({
      enabled: true,
      environment: "production",
      sampleRate: 1,
    });
  });

  it("is on but sampled down on the deployed dev build", () => {
    const gating = resolveSentryGating(DSN, "development", "production");

    expect(gating.enabled).toBe(true);
    expect(gating.environment).toBe("development");
    expect(gating.sampleRate).toBeLessThan(1);
    expect(gating.sampleRate).toBeGreaterThan(0);
  });
});

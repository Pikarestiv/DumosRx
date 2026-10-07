import { describe, it, expect } from "vitest";
import {
  API_ENVIRONMENTS,
  APP_ENVIRONMENTS,
  resolveApiOverride,
  resolveAppOverride,
} from "@/lib/api/server-environments";

/**
 * The Server Config switcher has to work in the installed admin PWA, which is
 * a production build. It cannot work by trusting whatever `dumos_api_url`
 * holds: that key is writable by any XSS foothold on this origin, and the
 * impersonation handoff builds a redirect carrying a live super_admin session
 * code from these URLs. So production honours the override only when it names
 * a server we already ship — an attacker who can write the key can move the
 * session between our own environments, never off them.
 */
describe("resolveApiOverride", () => {
  const PROD = "https://api.dumosrx.com/api/v1";
  const DEV = "https://api.dev.dumosrx.com/api/v1";

  it("honours a known environment in a production build", () => {
    expect(resolveApiOverride(DEV, { isProduction: true, fallback: PROD })).toBe(DEV);
  });

  it("refuses an attacker-controlled host in a production build", () => {
    expect(
      resolveApiOverride("https://evil.example.com/api/v1", { isProduction: true, fallback: PROD }),
    ).toBe(PROD);
  });

  it("refuses a known host with an appended path in a production build", () => {
    expect(
      resolveApiOverride(`${DEV}@evil.example.com`, { isProduction: true, fallback: PROD }),
    ).toBe(PROD);
  });

  it("ignores a trailing slash rather than treating it as a different server", () => {
    expect(resolveApiOverride(`${DEV}/`, { isProduction: true, fallback: PROD })).toBe(DEV);
  });

  it("falls back when nothing is stored", () => {
    expect(resolveApiOverride(null, { isProduction: true, fallback: PROD })).toBe(PROD);
  });

  /** Outside production an arbitrary URL is a developer pointing at their own box. */
  it("allows an arbitrary URL outside a production build", () => {
    expect(
      resolveApiOverride("http://localhost:9999/api/v1", { isProduction: false, fallback: PROD }),
    ).toBe("http://localhost:9999/api/v1");
  });

  it("ships the production API as a known environment", () => {
    expect(API_ENVIRONMENTS.map((env) => env.url)).toContain(PROD);
  });
});

describe("resolveAppOverride", () => {
  const PROD = "https://app.dumosrx.com";

  it("refuses an attacker-controlled host in a production build", () => {
    expect(
      resolveAppOverride("https://evil.example.com", { isProduction: true, fallback: PROD }),
    ).toBe(PROD);
  });

  it("honours a known app URL in a production build", () => {
    const known = APP_ENVIRONMENTS.find((env) => env.url !== PROD)!;

    expect(resolveAppOverride(known.url, { isProduction: true, fallback: PROD })).toBe(known.url);
  });
});

import { describe, it, expect } from "vitest";
import { isChunkLoadError } from "@/lib/utils/chunk-error";

/**
 * Regression coverage: a stale-chunk failure on this app's static export
 * (`output: export`) doesn't fail to fetch at all - the host falls back to
 * serving index.html (200 OK, HTML) for a missing chunk path, so the
 * browser throws a plain "Unexpected token '<'" SyntaxError trying to
 * execute that HTML as the JS module it requested. That shape wasn't
 * recognized by CHUNK_ERROR_PATTERN, so the auto-reload in
 * global-error-listener.tsx / error-boundary.tsx never fired for it -
 * confirmed live in production as a blank /dashboard or /settings/:tab the
 * person had to manually refresh out of.
 */
describe("isChunkLoadError", () => {
  it("recognizes the static-export HTML-fallback SyntaxError", () => {
    expect(isChunkLoadError(new SyntaxError("Unexpected token '<'"))).toBe(true);
  });

  it("still recognizes every previously-covered browser phrasing", () => {
    expect(isChunkLoadError(new Error("Loading chunk 42 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 7 failed"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed"))).toBe(true);
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
  });

  it("does not misclassify an unrelated error", () => {
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'foo')"))).toBe(false);
  });

  it("does not misclassify a JSON.parse() failure on an HTML API response as a stale chunk", () => {
    // V8's own wording when response.json() (base-client.ts) hits a proxy/
    // gateway HTML error page instead of JSON - same leading text as the
    // real chunk-load SyntaxError, but a genuine backend problem, not a
    // stale build. Must not trigger the auto-reload: the reload guard
    // clears on every successful boot, so misclassifying this would reload
    // forever instead of once.
    expect(
      isChunkLoadError(
        new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`),
      ),
    ).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

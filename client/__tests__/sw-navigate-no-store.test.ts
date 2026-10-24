import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A-158 follow-up: sw.js's navigate handler is documented as "network first" specifically so a page never goes visibly sta…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sw-navigate-no-store-test-ts-L5
describe("sw.js navigate fetch bypasses the HTTP cache", () => {
  it("passes cache: \"no-store\" on the navigation request's own fetch, not just the manifest fetch", () => {
    const source = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");

    // The navigate branch's own request fetch - distinct from the runtime stale-while-revalidate branch's plain `fetch(request…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sw-navigate-no-store-test-ts-L23
    const fetchCallMatch = source.match(/fetch\(request, \{[^}]*\}\)/);
    expect(fetchCallMatch).not.toBeNull();
    expect(fetchCallMatch?.[0]).toMatch(/cache:\s*"no-store"/);
  });
});

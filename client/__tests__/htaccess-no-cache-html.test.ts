import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A-158 follow-up: nothing in .htaccess told the browser (or any
 * intermediate proxy/CDN) that an HTML document shouldn't be cached
 * long-term, leaving index.html/page documents subject to the browser's own
 * heuristic HTTP caching with no explicit freshness rule. Combined with
 * sw.js's navigate handler not forcing `cache: "no-store"` either (see
 * sw-navigate-no-store.test.ts), a device could get served a stale page
 * document even on what the app believes is a fresh "network first"
 * fetch - reproducible live as Sentry DUMOSRX-CLIENT-F (one device stuck
 * replaying the same stale release 178 times, unable to reach /inventory's
 * catalog tab).
 */
describe(".htaccess disables caching for HTML documents", () => {
  it("sets a no-cache Cache-Control header for .html files", () => {
    const source = readFileSync(resolve(__dirname, "../public/.htaccess"), "utf8");

    expect(source).toMatch(/<IfModule mod_headers\.c>/);
    expect(source).toMatch(/<FilesMatch[^>]*\\\.html\$[^>]*>/);
    expect(source).toMatch(/Header set Cache-Control ["']no-cache/i);
  });
});

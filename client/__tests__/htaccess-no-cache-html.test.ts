import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A-158 follow-up: nothing in .htaccess told the browser (or any intermediate proxy/CDN) that an HTML document shouldn't b…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-htaccess-no-cache-html-test-ts-L5
describe(".htaccess disables caching for HTML documents", () => {
  it("sets a no-cache Cache-Control header for .html files", () => {
    const source = readFileSync(resolve(__dirname, "../public/.htaccess"), "utf8");

    expect(source).toMatch(/<IfModule mod_headers\.c>/);
    expect(source).toMatch(/<FilesMatch[^>]*\\\.html\$[^>]*>/);
    expect(source).toMatch(/Header set Cache-Control ["']no-cache/i);
  });
});

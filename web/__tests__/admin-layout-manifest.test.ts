import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Installing from /admin must install the ADMIN app, not the site-wide one.
 * See web/AGENTS.md: the manifest link is declared in this layout's metadata
 * so it lands in the exported HTML at build time. An earlier version injected
 * it from a useEffect after hydration, which iOS Safari's "Add to Home Screen"
 * never saw -- it installed site.webmanifest (start_url /dashboard, a
 * cross-origin bounce to app.dumosrx.com).
 */
describe("admin layout manifest metadata", () => {
  const layoutPath = path.resolve(__dirname, "../app/admin/layout.tsx");

  /**
   * A client component's `metadata` export is silently ignored by Next, so
   * this layout losing its server-component status reintroduces the bug with
   * no error anywhere.
   */
  it("is a server component", () => {
    const source = readFileSync(layoutPath, "utf8");

    // Not anchored to the start: a directive after a comment or JSDoc block is
    // still a valid prologue, and a layout has no other reason to hold this string.
    expect(source).not.toContain("use client");
  });

  /** Losing this directive breaks hooks in the server build, loudly - but the
   * pair of assertions is what documents the split. */
  it("keeps the guard in a client component", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../components/admin/admin-layout-client.tsx"),
      "utf8",
    );

    expect(source).toMatch(/^\s*["']use client["']/);
  });

  it("declares the admin manifest so the exported HTML carries it", async () => {
    const { metadata } = await import("@/app/admin/layout");

    expect(metadata.manifest).toBe("/admin-manifest.webmanifest");
  });

  /**
   * Next renders `appleWebApp.capable` as `mobile-web-app-capable`, a name
   * Apple does not read, so the legacy tag is set explicitly for iOS before
   * 16.4 (which takes standalone from the meta tag, not the manifest).
   */
  it("names the installed iOS app and keeps the legacy standalone hint", async () => {
    const { metadata } = await import("@/app/admin/layout");

    expect(metadata.appleWebApp).toMatchObject({ title: "DumosRx Admin" });
    expect(metadata.other?.["apple-mobile-web-app-capable"]).toBe("yes");
  });
});

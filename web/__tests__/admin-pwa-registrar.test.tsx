import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AdminPwaRegistrar } from "@/components/admin/admin-pwa-registrar";

/**
 * The admin PWA is scoped to /admin/ so installing it never takes over the
 * marketing site or a store owner's dashboard, and the manifest link is
 * injected per-page rather than site-wide for the same reason.
 */
describe("AdminPwaRegistrar", () => {
  const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));

  beforeEach(() => {
    register.mockClear();
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("links the admin manifest while an admin page is mounted", () => {
    render(<AdminPwaRegistrar />);

    const link = document.querySelector('link[rel="manifest"]');
    expect(link?.getAttribute("href")).toBe("/admin-manifest.webmanifest");
  });

  /**
   * The root layout emits a site-wide manifest and the browser uses the
   * FIRST link in tree order, so appending a second one did nothing at all:
   * installing from /admin installed the site app pointing at /dashboard.
   */
  it("replaces an existing manifest link rather than appending a second", () => {
    const existing = document.createElement("link");
    existing.rel = "manifest";
    existing.href = "/site.webmanifest";
    document.head.appendChild(existing);

    render(<AdminPwaRegistrar />);

    const links = document.querySelectorAll('link[rel="manifest"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/admin-manifest.webmanifest");

    existing.remove();
  });

  it("restores the site manifest when it unmounts", () => {
    const existing = document.createElement("link");
    existing.rel = "manifest";
    existing.href = "/site.webmanifest";
    document.head.appendChild(existing);

    const { unmount } = render(<AdminPwaRegistrar />);
    unmount();

    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
      "/site.webmanifest",
    );

    existing.remove();
  });

  /** Leaving it behind would offer the admin app from the marketing site. */
  it("removes the manifest link when unmounted if it added one", () => {
    const { unmount } = render(<AdminPwaRegistrar />);
    unmount();

    expect(document.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it("registers the worker scoped to /admin/ in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    render(<AdminPwaRegistrar />);

    expect(register).toHaveBeenCalledWith("/admin-sw.js", { scope: "/admin/" });
  });

  /** A worker holding the shell makes dev hot reloads behave strangely. */
  it("does not register in development", () => {
    render(<AdminPwaRegistrar />);

    expect(register).not.toHaveBeenCalled();
  });
});

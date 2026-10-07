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

  /** Leaving it behind would offer the admin app from the marketing site. */
  it("removes the manifest link when unmounted", () => {
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

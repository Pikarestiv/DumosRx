import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AdminPwaRegistrar } from "@/components/admin/admin-pwa-registrar";

/**
 * The admin PWA is scoped to /admin/ so installing it never takes over the
 * marketing site or a store owner's dashboard. The manifest link is NOT this
 * component's job -- see admin-layout-manifest.test.ts.
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

  /**
   * It used to swap the root layout's manifest href in an effect. iOS Safari's
   * "Add to Home Screen" reads the manifest attached at load, so the swap came
   * too late and the site-wide app got installed instead. Declaring it in the
   * layout's metadata only works while nothing mutates the link afterwards.
   */
  it("leaves the manifest link the exported HTML shipped alone", () => {
    const existing = document.createElement("link");
    existing.rel = "manifest";
    existing.href = "/admin-manifest.webmanifest";
    document.head.appendChild(existing);

    const { unmount } = render(<AdminPwaRegistrar />);

    const links = document.querySelectorAll('link[rel="manifest"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/admin-manifest.webmanifest");

    unmount();

    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
      "/admin-manifest.webmanifest",
    );

    existing.remove();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PwaRegistrar } from "@/components/pwa-registrar";

describe("PwaRegistrar", () => {
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

  it("does not register in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<PwaRegistrar />);

    window.dispatchEvent(new Event("load"));

    expect(register).not.toHaveBeenCalled();
  });

  it("does not register on admin pages even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const originalPathname = window.location.pathname;
    try {
      window.history.pushState({}, "", "/admin/stores");
      render(<PwaRegistrar />);

      window.dispatchEvent(new Event("load"));

      expect(register).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, "", originalPathname);
    }
  });

  it("registers /sw.js in production on non-admin routes", () => {
    vi.stubEnv("NODE_ENV", "production");
    const originalPathname = window.location.pathname;
    try {
      window.history.pushState({}, "", "/pricing");
      render(<PwaRegistrar />);

      window.dispatchEvent(new Event("load"));

      expect(register).toHaveBeenCalledWith("/sw.js");
    } finally {
      window.history.pushState({}, "", originalPathname);
    }
  });
});

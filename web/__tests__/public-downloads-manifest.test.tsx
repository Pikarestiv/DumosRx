import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  webApiClient: { request: mockRequest },
}));

const manifest = {
  version: "1.2.3",
  platforms: {
    windows: { url: "https://cdn/win.msi", exists: true, sizeBytes: 1048576 },
    macos: { url: "https://cdn/mac.dmg", exists: true, sizeBytes: 2097152 },
    linux: { url: "https://cdn/linux.AppImage", exists: false, sizeBytes: null },
    android: { url: "https://cdn/app.apk", exists: true, sizeBytes: 3145728 },
  },
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(manifest);
});

describe("release manifest hooks", () => {
  it("keeps the admin hook on the super_admin-gated admin endpoint", async () => {
    const { useLatestRelease } = await import("@/lib/api/release-hooks");
    const { result } = renderHook(() => useLatestRelease(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(mockRequest).toHaveBeenCalledWith("admin/downloads/manifest");
  });

  it("reads the unauthenticated public endpoint from the public hook", async () => {
    const { usePublicLatestRelease } = await import("@/lib/api/release-hooks");
    const { result } = renderHook(() => usePublicLatestRelease(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(mockRequest).toHaveBeenCalledWith("downloads/manifest");
    expect(mockRequest).not.toHaveBeenCalledWith("admin/downloads/manifest");
    expect(result.current.data?.version).toBe("1.2.3");
    expect(result.current.data?.linux).toBe("");
    expect(result.current.data?.windows).toBe("https://cdn/win.msi");
  });

  it("gives the public hook its own cache slot so an admin 401 cannot poison it", async () => {
    const { useLatestRelease, usePublicLatestRelease } = await import(
      "@/lib/api/release-hooks"
    );
    const keys = renderHook(
      () => ({ admin: useLatestRelease(), pub: usePublicLatestRelease() }),
      { wrapper },
    );

    await waitFor(() => expect(keys.result.current.pub.data).toBeTruthy());
    expect(mockRequest).toHaveBeenCalledWith("admin/downloads/manifest");
    expect(mockRequest).toHaveBeenCalledWith("downloads/manifest");
  });
});

describe("public downloads page", () => {
  it("never calls the admin-only manifest endpoint", async () => {
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn() }),
      useSearchParams: () => new URLSearchParams(),
    }));
    const { render } = await import("@testing-library/react");
    const { default: DownloadsPage } = await import("@/app/downloads/page");

    render(<DownloadsPage />, { wrapper });

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest).not.toHaveBeenCalledWith("admin/downloads/manifest");
    expect(mockRequest).toHaveBeenCalledWith("downloads/manifest");
  });
});

describe("401 recovery guard", () => {
  it("only attempts session recovery for the authenticated admin surface", async () => {
    const { shouldRecoverFromUnauthorized } = await import("@/lib/api/base-client");

    expect(shouldRecoverFromUnauthorized("/admin/downloads", "admin/downloads/manifest")).toBe(
      true,
    );
    expect(shouldRecoverFromUnauthorized("/admin", "/alerts")).toBe(true);
    expect(shouldRecoverFromUnauthorized("/downloads/", "downloads/manifest")).toBe(false);
    expect(shouldRecoverFromUnauthorized("/", "/system-configs/landing")).toBe(false);
    expect(shouldRecoverFromUnauthorized("/store/acme/checkout", "/storefront/acme")).toBe(
      false,
    );
  });

  it("still exempts the login and refresh calls on the admin surface", async () => {
    const { shouldRecoverFromUnauthorized } = await import("@/lib/api/base-client");

    expect(shouldRecoverFromUnauthorized("/admin/login", "/login")).toBe(false);
    expect(shouldRecoverFromUnauthorized("/admin", "/admin/session/refresh")).toBe(false);
  });
});

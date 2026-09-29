import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { mockRequest, mockPush, mockPathname } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockPush: vi.fn(),
  mockPathname: vi.fn(() => "/admin"),
}));

vi.mock("@/lib/api/client", () => ({
  webApiClient: { request: mockRequest },
}));

vi.mock("@/lib/query-client", () => ({
  queryClient: { cancelQueries: vi.fn(), clear: vi.fn() },
}));

vi.mock("@/lib/store/use-admin-store", () => ({
  useAdminStore: { getState: () => ({ reset: vi.fn() }) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/admin/admin-sidebar", () => ({
  AdminSidebar: () => <div data-testid="admin-sidebar" />,
}));

vi.mock("@/components/admin/admin-header", () => ({
  AdminHeader: () => <div data-testid="admin-header" />,
}));

vi.mock("@/components/auth/admin-login-form", () => ({
  AdminLoginForm: () => <div data-testid="admin-login-form" />,
}));

const superAdmin = {
  id: "1",
  email: "super@dumosrx.com",
  first_name: "Super",
  last_name: "Admin",
  role: "super_admin",
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const loadStore = async () => {
  const mod = await import("@/lib/store/use-admin-auth-store");
  return mod.useAdminAuthStore;
};

beforeEach(() => {
  vi.resetModules();
  mockRequest.mockReset();
  mockPush.mockReset();
  mockPathname.mockReturnValue("/admin");
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("initSession() concurrency", () => {
  it("collapses concurrent callers into a single refresh request", async () => {
    const pending = deferred<{ token: string; user: typeof superAdmin }>();
    mockRequest.mockReturnValue(pending.promise);

    const useAdminAuthStore = await loadStore();
    const first = useAdminAuthStore.getState().initSession();
    const second = useAdminAuthStore.getState().initSession();

    pending.resolve({ token: "fresh-token", user: superAdmin });
    await Promise.all([first, second]);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(useAdminAuthStore.getState().sessionVerified).toBe(true);
  });

  it("lets a later caller start a new request once the shared one settles", async () => {
    mockRequest.mockResolvedValue({ token: "fresh-token", user: superAdmin });

    const useAdminAuthStore = await loadStore();
    await useAdminAuthStore.getState().initSession();
    await useAdminAuthStore.getState().initSession();

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("shares the failure with every concurrent caller without clearing twice", async () => {
    const pending = deferred<never>();
    mockRequest.mockReturnValue(pending.promise);

    const useAdminAuthStore = await loadStore();
    const first = useAdminAuthStore.getState().initSession();
    const second = useAdminAuthStore.getState().initSession();

    pending.reject(new Error("Session expired."));
    await Promise.all([first, second]);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(useAdminAuthStore.getState().sessionVerified).toBe(false);
    expect(useAdminAuthStore.getState().user).toBeNull();
  });
});

describe("admin login page", () => {
  it("does not redirect on a persisted-but-unverified user", async () => {
    mockPathname.mockReturnValue("/admin/login");
    mockRequest.mockRejectedValue(new Error("Session expired."));

    const useAdminAuthStore = await loadStore();
    useAdminAuthStore.setState({ user: superAdmin, sessionVerified: false, token: null });

    const { default: AdminLoginPage } = await import("@/app/admin/login/page");
    render(<AdminLoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId("admin-login-form")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects only once the server has actually verified the session", async () => {
    mockPathname.mockReturnValue("/admin/login");
    mockRequest.mockResolvedValue({ token: "fresh-token", user: superAdmin });

    const useAdminAuthStore = await loadStore();
    useAdminAuthStore.setState({ user: superAdmin, sessionVerified: false, token: null });

    const { default: AdminLoginPage } = await import("@/app/admin/login/page");
    render(<AdminLoginPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/admin");
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

describe("admin layout guard", () => {
  it("does not bounce to the login page while a session check is in flight", async () => {
    const pending = deferred<{ token: string; user: typeof superAdmin }>();
    mockRequest.mockReturnValue(pending.promise);

    const useAdminAuthStore = await loadStore();
    useAdminAuthStore.setState({ user: superAdmin, sessionVerified: false, token: null });

    mockPathname.mockReturnValue("/admin/login");
    const { default: AdminLayout } = await import("@/app/admin/layout");
    const { rerender } = render(
      <AdminLayout>
        <div data-testid="admin-child" />
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("admin-child")).toBeInTheDocument();
    });

    mockPathname.mockReturnValue("/admin");
    rerender(
      <AdminLayout>
        <div data-testid="admin-child" />
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
    expect(mockPush).not.toHaveBeenCalled();

    pending.resolve({ token: "fresh-token", user: superAdmin });
    await waitFor(() => {
      expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("still redirects to the login page once verification genuinely fails", async () => {
    mockRequest.mockRejectedValue(new Error("Session expired."));

    const useAdminAuthStore = await loadStore();
    useAdminAuthStore.setState({ user: superAdmin, sessionVerified: false, token: null });

    const { default: AdminLayout } = await import("@/app/admin/layout");
    render(
      <AdminLayout>
        <div data-testid="admin-child" />
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/admin/login");
    });
  });
});

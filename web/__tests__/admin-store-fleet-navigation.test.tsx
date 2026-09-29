import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { StoreTable } from "@/components/admin/stores/store-table";
import { StoreDialog } from "@/components/admin/dashboard/store-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { adminStoreDetailPath } from "@/lib/admin-routes";
import type { AdminStoreSummary } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: { role: "super_admin" } }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));

const store: AdminStoreSummary = {
  id: "8f1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
  name: "Pikarestiv Stores",
  owner: "Ada Owner",
  email: "ada@dumosrx.com",
  plan: "pro",
  status: "Active",
  date: "Jan 02, 2026",
  stores: 1,
  revenue: "₦120,000",
  device_id: "DESKTOP-9QK3ZLA",
};

const noop = () => undefined;

const renderTable = (overrides: Partial<AdminStoreSummary> = {}) =>
  render(
    <StoreTable
      storeList={[{ ...store, ...overrides }]}
      isLoading={false}
      pendingStoreId={null}
      router={{ push } as unknown as AppRouterInstance}
      handleImpersonate={noop}
      handleViewBilling={noop}
      setSelectedStore={noop}
      setIsSuspendDialogOpen={noop}
      setIsTrialDialogOpen={noop}
      setIsActivatePlanDialogOpen={noop}
      handleUnsuspend={noop}
      handleToggleDemo={noop}
      handleArchive={noop}
      handleRestore={noop}
      handlePurge={noop}
    />,
  );

describe("Store Fleet row navigation", () => {
  beforeEach(() => push.mockClear());

  it("opens the store detail page when the row itself is clicked", () => {
    renderTable();

    fireEvent.click(screen.getByText("Pikarestiv Stores"));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(adminStoreDetailPath(store.id));
  });

  it("opens the store detail page from the keyboard", () => {
    renderTable();

    fireEvent.keyDown(screen.getByRole("link", { name: /view details for/i }), { key: "Enter" });

    expect(push).toHaveBeenCalledWith(adminStoreDetailPath(store.id));
  });

  it("does not navigate when the kebab menu trigger is clicked", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /actions for/i }));

    expect(push).not.toHaveBeenCalled();
  });

  it("renders the device id the fleet search matches on", () => {
    renderTable();

    expect(screen.getByText(/DESKTOP-9QK3ZLA/)).toBeInTheDocument();
  });

  it("flags an archived store in the row", () => {
    renderTable({ is_archived: true });

    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});

describe("Recent Stores deep link", () => {
  beforeEach(() => push.mockClear());

  it("sends 'View Full Profile' straight to the store detail page", () => {
    render(<StoreDialog selectedStore={store} setSelectedStore={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "View Full Profile" }));

    expect(push).toHaveBeenCalledWith(adminStoreDetailPath(store.id));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("/admin/stores?search="));
  });
});

describe("fleet search debounce", () => {
  it("only settles on the final keystroke after the delay", () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "D" },
    });

    rerender({ value: "DE" });
    rerender({ value: "DESKTOP" });

    expect(result.current).toBe("D");

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("D");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("DESKTOP");

    vi.useRealTimers();
  });
});

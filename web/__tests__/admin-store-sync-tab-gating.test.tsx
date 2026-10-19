import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreDetailTabs } from "@/components/admin/stores/details/store-detail-tabs";
import { StoreSyncTab } from "@/components/admin/stores/details/store-sync-tab";
import type { AdminStoreDetail } from "@/lib/types/admin";

const { nav, auth, sync } = vi.hoisted(() => ({
  nav: { replace: vi.fn(), push: vi.fn(), search: "?id=store-1" },
  auth: { permissions: [] as string[], role: "platform_admin" },
  sync: { agreementEnabled: [] as boolean[], divergenceEnabled: [] as boolean[] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({
    user: { role: auth.role, effective_permissions: auth.permissions },
  }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: (
    user: { role?: string; effective_permissions?: string[] } | null | undefined,
    permission: string,
  ) =>
    !!user &&
    (user.role === "super_admin" || (user.effective_permissions ?? []).includes(permission)),
}));

const idle = { data: undefined, isLoading: false, isError: false };

vi.mock("@/lib/api/admin-hooks-sync", () => ({
  useStoreTableAgreement: (_id: string, enabled = true) => {
    sync.agreementEnabled.push(enabled);
    return idle;
  },
  useStoreStockDivergence: (_id: string, enabled = true) => {
    sync.divergenceEnabled.push(enabled);
    return idle;
  },
  useAdminStoreSyncHealth: () => idle,
  useStoreQueueState: () => idle,
  useStoreSyncCommands: () => idle,
  useIssueSyncCommandMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteStockReportMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDeviceNicknameMutation: () => ({ mutate: vi.fn(), isPending: false }),
  syncReasonLabel: () => null,
  SYNC_COMMANDS_KEY: "admin-store-sync-commands",
}));

vi.mock("@/components/admin/stores/details/store-overview-tab", () => ({
  StoreOverviewTab: () => <div>Overview body</div>,
}));

vi.mock("@/components/admin/stores/details/store-activity-tab", () => ({
  StoreActivityTab: () => <div>Activity body</div>,
}));

const store = {
  id: "store-1",
  name: "Cynthia Pharmacy",
  currency: "NGN",
  sync: {
    last_sync_human: "2 minutes ago",
    auto_sync_enabled: true,
    interval: 5,
    device_id: "DRX-1",
    device_label: "Front till",
  },
} as unknown as AdminStoreDetail;

Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = "?id=store-1";
  auth.permissions = [];
  auth.role = "platform_admin";
  sync.agreementEnabled = [];
  sync.divergenceEnabled = [];
});

/**
 * A-290: all five Sync panels are server-gated on `view_platform_health`, so
 * an operator without it must not be offered the tab at all — including
 * through a shared `?tab=sync` link.
 */
describe("Store details Sync tab permission gate", () => {
  it("offers neither the trigger nor the content without view_platform_health", () => {
    render(<StoreDetailTabs store={store} />);

    expect(screen.queryByRole("tab", { name: /Sync/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Device Table Agreement")).not.toBeInTheDocument();
    expect(screen.getByText("Overview body")).toBeInTheDocument();
  });

  it("falls back to Overview for a ?tab=sync deep link without the permission", () => {
    nav.search = "?id=store-1&tab=sync";
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Overview body")).toBeInTheDocument();
    expect(screen.queryByText("Device Table Agreement")).not.toBeInTheDocument();
  });

  it("does not fire the badge's two queries, or render a badge, without the permission", () => {
    render(<StoreDetailTabs store={store} />);

    expect(sync.agreementEnabled.every((enabled) => enabled === false)).toBe(true);
    expect(sync.divergenceEnabled.every((enabled) => enabled === false)).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("offers the tab with the permission", () => {
    auth.permissions = ["view_platform_health"];
    nav.search = "?id=store-1&tab=sync";
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: /Sync/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Device Table Agreement")).toBeInTheDocument();
    expect(sync.agreementEnabled.some((enabled) => enabled === true)).toBe(true);
  });

  it("offers the tab to a super admin, who carries every permission implicitly", () => {
    auth.role = "super_admin";
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: /Sync/ })).toBeInTheDocument();
  });

  it("StoreSyncTab renders nothing for an unpermitted caller, independent of its parent", () => {
    const { container } = render(<StoreSyncTab store={store} />);

    expect(container).toBeEmptyDOMElement();
  });
});

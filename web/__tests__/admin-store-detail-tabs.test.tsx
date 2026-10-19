import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreDetailTabs } from "@/components/admin/stores/details/store-detail-tabs";
import type { AdminStoreDetail } from "@/lib/types/admin";
import type { StoreStockDivergence, StoreTableAgreement } from "@/lib/types/admin-platform";

const { nav, sync } = vi.hoisted(() => ({
  nav: { replace: vi.fn(), push: vi.fn(), search: "?id=store-1" },
  sync: {
    table: { data: undefined, isLoading: true, isError: false } as {
      data?: StoreTableAgreement;
      isLoading: boolean;
      isError: boolean;
    },
    stock: { data: undefined, isLoading: true, isError: false } as {
      data?: StoreStockDivergence;
      isLoading: boolean;
      isError: boolean;
    },
    healthCalls: 0,
    queueCalls: 0,
    commandCalls: 0,
  },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: { role: "super_admin" } }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: () => true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const idle = { data: undefined, isLoading: false, isError: false };

vi.mock("@/lib/api/admin-hooks-sync", () => ({
  useStoreTableAgreement: () => sync.table,
  useStoreStockDivergence: () => sync.stock,
  useAdminStoreSyncHealth: () => {
    sync.healthCalls += 1;
    return idle;
  },
  useStoreQueueState: () => {
    sync.queueCalls += 1;
    return idle;
  },
  useStoreSyncCommands: () => {
    sync.commandCalls += 1;
    return idle;
  },
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

function agreement(devices: StoreTableAgreement["devices"]): StoreTableAgreement {
  return { measured: true, diverged_devices: devices.filter((d) => d.diverged).length, devices };
}

function divergence(): StoreStockDivergence {
  return { measured: true, diverged_devices: 0, devices: [] };
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "?id=store-1";
  sync.table = { data: undefined, isLoading: true, isError: false };
  sync.stock = { data: undefined, isLoading: true, isError: false };
  sync.healthCalls = 0;
  sync.queueCalls = 0;
  sync.commandCalls = 0;
});

describe("StoreDetailTabs", () => {
  it("opens on Overview with no tab param, and shows only that tab's body", () => {
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Overview body")).toBeInTheDocument();
    expect(screen.queryByText("Activity body")).not.toBeInTheDocument();
  });

  it("defers the Sync tab's own queries until the tab is opened", async () => {
    render(<StoreDetailTabs store={store} />);

    expect(sync.healthCalls).toBe(0);
    expect(sync.queueCalls).toBe(0);
    expect(sync.commandCalls).toBe(0);

    await userEvent.click(screen.getByRole("tab", { name: /Sync/ }));

    expect(nav.replace).toHaveBeenCalledWith("/admin/stores/details/?id=store-1&tab=sync", {
      scroll: false,
    });
  });

  it("mounts the Sync tab's panels, and its queries, for a sync deep link", () => {
    nav.search = "?id=store-1&tab=sync";
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: /Sync/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Device Table Agreement")).toBeInTheDocument();
    expect(screen.getByText("Sync Settings")).toBeInTheDocument();
    expect(sync.healthCalls).toBeGreaterThan(0);
    expect(sync.queueCalls).toBeGreaterThan(0);
  });

  it("replaces rather than pushes, and drops the param when returning to Overview", async () => {
    nav.search = "?id=store-1&tab=activity";
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByText("Activity body")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Overview/ }));

    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/admin/stores/details/?id=store-1", {
      scroll: false,
    });
  });

  it("renders no pill and an empty live region while the instruments are loading", () => {
    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: "Sync" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("folds the verdict into the Sync tab's accessible name and announces it once", () => {
    sync.table = {
      data: agreement([
        {
          device_id: "DRX-1",
          device_label: "Front till",
          device_nickname: null,
          tables: [],
          diverged_tables: ["sales"],
          has_local_copy: true,
          stale: false,
          diverged: true,
          reported_at: "2026-10-19T10:00:00Z",
        },
      ]),
      isLoading: false,
      isError: false,
    };
    sync.stock = { data: divergence(), isLoading: false, isError: false };

    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: "Sync 1 device disagrees" })).toBeInTheDocument();

    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveAttribute("aria-atomic", "true");
    expect(live[0]).toHaveTextContent("1 device disagrees with the cloud on stock or tables");
  });

  it("reports the instruments being unavailable rather than claiming agreement", () => {
    sync.table = { data: undefined, isLoading: false, isError: true };
    sync.stock = { data: divergence(), isLoading: false, isError: false };

    render(<StoreDetailTabs store={store} />);

    expect(screen.getByRole("tab", { name: "Sync Unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sync status unavailable for this store",
    );
  });
});

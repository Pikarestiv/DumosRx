import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreRecentActivityCard } from "@/components/admin/stores/details/store-detail-sections";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

describe("StoreRecentActivityCard (A-330)", () => {
  const baseStore: AdminStoreDetail = {
    id: "store-1",
    name: "Test Store",
    operational_metrics: {
      staff_count: 1,
      device_id: "DEV-1",
      device_count: 1,
      active_sessions: 0,
      inventory: { products: 1, categories: 1, suppliers: 0, customers: 0 },
      stock_activity: { movements: 0, movements_last_window: 0, audits: 0, audits_last_window: 0 },
      last_active_at: null,
      last_active_human: "Never",
      activity_last_window: 0,
    },
    recent_activity: [],
  } as unknown as AdminStoreDetail;

  it("renders empty state when there is no activity recorded", () => {
    render(<StoreRecentActivityCard store={baseStore} />);
    expect(screen.getByText("No activity recorded for this store.")).toBeInTheDocument();
  });

  it("renders activity logs with action, description, actor and at without requiring status", () => {
    const storeWithActivity: AdminStoreDetail = {
      ...baseStore,
      recent_activity: [
        {
          id: "act-1",
          action: "STORE_CREATED",
          description: "New store was provisioned",
          actor: "Super Admin",
          at: "2 hours ago",
        },
        {
          id: "act-2",
          action: "PASSWORD_RESET",
          description: "Password reset requested",
          actor: null,
          at: "1 day ago",
        },
      ],
    };

    render(<StoreRecentActivityCard store={storeWithActivity} />);

    expect(screen.getByText("STORE_CREATED")).toBeInTheDocument();
    expect(screen.getByText("New store was provisioned")).toBeInTheDocument();
    expect(screen.getByText(/Super Admin/)).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();

    expect(screen.getByText("PASSWORD_RESET")).toBeInTheDocument();
    expect(screen.getByText("Password reset requested")).toBeInTheDocument();
    expect(screen.getByText("1 day ago")).toBeInTheDocument();
  });
});

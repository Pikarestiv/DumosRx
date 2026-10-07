import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreSyncHealthSection } from "@/components/admin/stores/details/store-sync-health-section";
import type { AdminStoreSyncHealth } from "@/lib/types/admin";

const empty: AdminStoreSyncHealth = {
  store_name: "Ikeja Branch",
  last_sync_at: null,
  daily: [],
  failures: { data: [], meta: undefined },
};

describe("StoreSyncHealthSection", () => {
  it("reads Never synced for a store with no sync history", () => {
    render(<StoreSyncHealthSection data={empty} isLoading={false} />);

    expect(screen.getByText(/never synced/i)).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("renders a recorded failure with its glossed reason and raw string", () => {
    render(
      <StoreSyncHealthSection
        isLoading={false}
        data={{
          ...empty,
          failures: {
            data: [
              {
                id: "f1",
                table_name: "customer_payments",
                record_id: "pay-1",
                operation: "INSERT",
                reason: "permission_denied",
                created_at: "2026-10-07T09:00:00Z",
              },
            ],
            meta: undefined,
          },
        }}
      />,
    );

    expect(screen.getByText(/no access to that store/i)).toBeDefined();
    expect(screen.getByText(/permission_denied/)).toBeDefined();
    expect(screen.getByText("pay-1")).toBeDefined();
    expect(screen.getByText("customer_payments")).toBeDefined();
  });

  /** §6: DD/MM/YYYY, never the US order a default toLocaleDateString gives. */
  it("renders the last sync date in DD/MM/YYYY order", () => {
    render(
      <StoreSyncHealthSection
        isLoading={false}
        data={{ ...empty, last_sync_at: "2026-10-07T09:00:00Z" }}
      />,
    );

    expect(screen.getByText(/07\/10\/2026/)).toBeDefined();
  });

  it("says so plainly when the store has synced but recorded no failures", () => {
    render(
      <StoreSyncHealthSection
        isLoading={false}
        data={{ ...empty, last_sync_at: "2026-10-07T09:00:00Z" }}
      />,
    );

    expect(screen.getByText(/no refusals recorded/i)).toBeDefined();
  });
});

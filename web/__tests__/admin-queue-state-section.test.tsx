import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreQueueStateSection } from "@/components/admin/stores/details/store-queue-state-section";

const device = (over = {}) => ({
  device_id: "DESKTOP-ONE",
  queue_depth: 3,
  stuck_count: 0,
  stuck_items: [],
  truncated: false,
  reported_at: "2026-10-07T09:00:00Z",
  ...over,
});

describe("StoreQueueStateSection", () => {
  /** Silence is not health — the rule this view would most easily break. */
  it("refuses to imply nothing is stuck when nothing has reported", () => {
    render(
      <StoreQueueStateSection
        data={{ measured: false, devices_with_stuck_items: 0, devices: [] }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/nothing can be said about what is stuck/i)).toBeDefined();
    expect(screen.queryByText(/no reporting device has anything stuck/i)).toBeNull();
  });

  it("confirms a clear queue only when devices reported one", () => {
    render(
      <StoreQueueStateSection
        data={{ measured: true, devices_with_stuck_items: 0, devices: [device()] }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/no reporting device has anything stuck/i)).toBeDefined();
  });

  it("names the stuck row, its table and its attempt count", () => {
    render(
      <StoreQueueStateSection
        data={{
          measured: true,
          devices_with_stuck_items: 1,
          devices: [
            device({
              stuck_count: 1,
              stuck_items: [
                { table_name: "stock_movements", record_id: "abc-123", attempts: 7, reason: "forbidden" },
              ],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText("stock_movements")).toBeDefined();
    expect(screen.getByText("abc-123")).toBeDefined();
    expect(screen.getByText(/7 attempts/)).toBeDefined();
    expect(screen.getByText(/1 of 1 devices have stuck rows/i)).toBeDefined();
  });

  /** A capped list must say so, or it understates the problem. */
  it("says when the list was truncated", () => {
    render(
      <StoreQueueStateSection
        data={{
          measured: true,
          devices_with_stuck_items: 1,
          devices: [
            device({
              stuck_count: 120,
              truncated: true,
              stuck_items: [
                { table_name: "sales", record_id: "r1", attempts: 5, reason: "forbidden" },
              ],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/showing the first 1 of 120/i)).toBeDefined();
  });

  it("renders unavailable on a failed request", () => {
    render(<StoreQueueStateSection data={undefined} isLoading={false} isError />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });
});

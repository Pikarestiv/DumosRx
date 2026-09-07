import { describe, it, expect } from "vitest";
import { buildWidgetSnapshotPayload } from "@/lib/utils/widget-snapshot";
import type { WidgetSnapshotResponse } from "@/lib/types/store";

const SAMPLE: WidgetSnapshotResponse = {
  fleet: { today_sales_formatted: "₦142,500.00", low_stock_alerts: 5, expiring_items: 2 },
  stores: [
    { id: "s1", name: "Main Branch", today_sales_formatted: "₦80,000.00", low_stock_alerts: 3, expiring_items: 1 },
  ],
};

describe("buildWidgetSnapshotPayload", () => {
  it("returns a linked:false payload when the account isn't cloud-linked, regardless of response data", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, false, 1000);
    expect(payload).toEqual({ linked: false, updatedAtEpochMs: 1000 });
  });

  it("returns a linked:false payload when there's no response yet, even if cloud-linked", () => {
    const payload = buildWidgetSnapshotPayload(null, true, 1000);
    expect(payload).toEqual({ linked: false, updatedAtEpochMs: 1000 });
  });

  it("maps the fleet block to camelCase when linked", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, true, 1000);
    expect(payload.linked).toBe(true);
    if (payload.linked) {
      expect(payload.fleet).toEqual({
        todaySalesFormatted: "₦142,500.00",
        lowStockCount: 5,
        expiringCount: 2,
      });
    }
  });

  it("maps each store entry to camelCase when linked", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, true, 1000);
    expect(payload.linked).toBe(true);
    if (payload.linked) {
      expect(payload.stores).toEqual([
        { id: "s1", name: "Main Branch", todaySalesFormatted: "₦80,000.00", lowStockCount: 3, expiringCount: 1 },
      ]);
    }
  });

  it("carries the provided timestamp through unchanged", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, true, 1731000000000);
    expect(payload.updatedAtEpochMs).toBe(1731000000000);
  });
});

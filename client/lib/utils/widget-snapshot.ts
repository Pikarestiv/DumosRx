import type { WidgetSnapshotResponse } from "@/lib/types/store";

export interface WidgetSnapshotStorePayload {
  id: string;
  name: string;
  todaySalesFormatted: string;
  lowStockCount: number;
  expiringCount: number;
}

export type WidgetSnapshotPayload =
  | { linked: false; updatedAtEpochMs: number }
  | {
      linked: true;
      updatedAtEpochMs: number;
      fleet: { todaySalesFormatted: string; lowStockCount: number; expiringCount: number };
      stores: WidgetSnapshotStorePayload[];
    };

/**
 * Converts the backend's snake_case /dashboard/widget-snapshot response into
 * the camelCase JSON written to native Android storage (see the "Canonical
 * widget snapshot schema" in the implementation plan) - the single shape
 * shared by the app's foreground writer and the WorkManager background
 * writer, so the Glance widget never needs to know which one produced it.
 */
export function buildWidgetSnapshotPayload(
  response: WidgetSnapshotResponse | null,
  isCloudLinked: boolean,
  nowMs: number,
): WidgetSnapshotPayload {
  if (!isCloudLinked || !response) {
    return { linked: false, updatedAtEpochMs: nowMs };
  }

  return {
    linked: true,
    updatedAtEpochMs: nowMs,
    fleet: {
      todaySalesFormatted: response.fleet.today_sales_formatted,
      lowStockCount: response.fleet.low_stock_alerts,
      expiringCount: response.fleet.expiring_items,
    },
    stores: response.stores.map((store) => ({
      id: store.id,
      name: store.name,
      todaySalesFormatted: store.today_sales_formatted,
      lowStockCount: store.low_stock_alerts,
      expiringCount: store.expiring_items,
    })),
  };
}

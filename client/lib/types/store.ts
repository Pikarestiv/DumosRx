// Store shape returned by the server's `/stores` list.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#types-store-ts-L1
export interface StoreOption {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  store_type?: string | null;
}

// Fields returned/accepted by the fleet-management (Settings > Store Profile) store CRUD endpoints — matches the server's Store model validati…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#types-store-ts-L15
export interface FleetStore extends StoreOption {
  status?: "online" | "offline";
  lastSync?: string;
  sales?: string;
  staff_count?: number;
  low_stock_alerts?: number;
  expiring_items?: number;
}

export interface FleetStorePayload {
  name: string;
  location?: string;
  address?: string;
  phone?: string;
  store_type?: string;
}

/** Shape returned by the `/dashboard/stats` endpoint powering the fleet
 * overview page (Settings > Store Profile fleet summary). */
export interface FleetStats {
  stats: {
    total_sales: { value: number; growth: string };
    inventory_value: { value: number };
    customers: { value: number; growth: string };
    stores_count: number;
    last_sync: string;
  };
  stores: FleetStore[];
}

export interface WidgetSnapshotStoreEntry {
  id: string;
  name: string;
  today_sales_formatted: string;
  low_stock_alerts: number;
  expiring_items: number;
}

export interface WidgetSnapshotResponse {
  fleet: {
    today_sales_formatted: string;
    low_stock_alerts: number;
    expiring_items: number;
  };
  stores: WidgetSnapshotStoreEntry[];
}

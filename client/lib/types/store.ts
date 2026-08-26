/** Store shape returned by the server's `/stores` list. The onboarding store
 * picker only reads `id`/`name`, but the endpoint's underlying Eloquent Store
 * model (laravel-server's Api/Web/StoreController::index) always includes the
 * fleet-management fields too, so they're typed here as optional rather than
 * hidden behind a cast. */
export interface StoreOption {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  store_type?: string | null;
}

/** Fields returned/accepted by the fleet-management (Settings > Store Profile)
 * store CRUD endpoints — matches the server's Store model validation in
 * laravel-server's Api/Web/StoreController. Extends `StoreOption` with the
 * optional fleet-overview stats-table fields returned by `/dashboard/stats`. */
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
    cloud_storage: { used_gb: number; limit_gb: number; percentage: number };
  };
  stores: FleetStore[];
}

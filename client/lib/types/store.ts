/** Minimal store shape used by the setup/onboarding store picker: both the
 * local `stores` table and the server's `/stores` list return at least these
 * two fields. */
export interface StoreOption {
  id: string;
  name: string;
}

/** Fields returned/accepted by the fleet-management (Settings > Store Profile)
 * store CRUD endpoints — matches the server's Store model validation in
 * laravel-server's Api/Web/StoreController. */
export interface FleetStore {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  store_type?: string | null;
}

export interface FleetStorePayload {
  name: string;
  location?: string;
  address?: string;
  phone?: string;
  store_type?: string;
}

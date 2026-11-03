import type { StoreRefusal } from "./store-refusal";

export interface PushResponse {
  success: boolean;
  /** Operator intents for this device, handed back on the push response so
   *  acting on one costs no extra round trip. See sync-commands.ts. */
  sync_commands?: Array<{
    id: string;
    action: string;
    table_name: string | null;
    record_id: string | null;
  }>;
  message?: string;
  processed?: number;
  // Changes the server isolated to their own savepoint and skipped individually rather than failing the whole batch; see SyncController::push.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-types-ts-L13
  failed?: { id: number; table_name: string; record_id: string; reason: string }[];
  // Local id -> server id, grouped by table, for INSERTs the server silently skipped because the name collided with an existing row (see SyncCon…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-types-ts-L17
  id_map?: Record<string, Record<string, string>>;
  // Record id -> server-assigned new `_version`, grouped by table_name, for UPDATE changes accepted via SyncController::push's strict version- e…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-types-ts-L24
  versions?: Record<string, Record<string, number>>;
}

export interface PullResponse {
  success: boolean;
  server_timestamp: string;
  changes: Record<string, Record<string, unknown>[]>;
  has_more?: Record<string, boolean>;
  refused_store_id?: string | null;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: unknown;
  refusal?: StoreRefusal;
}

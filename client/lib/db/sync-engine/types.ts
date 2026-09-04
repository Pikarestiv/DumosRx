export interface PushResponse {
  success: boolean;
  message?: string;
  processed?: number;
  /** Changes the server isolated to their own savepoint and skipped
   * individually rather than failing the whole batch; see
   * SyncController::push. */
  failed?: { id: number; table_name: string; record_id: string; reason: string }[];
  /** Local id -> server id, grouped by table, for INSERTs the server silently
   * skipped because the name collided with an existing row (see
   * SyncController::push's "duplicate name" handling for categories and
   * suppliers). Lets the client fix up its own local rows immediately
   * instead of depending on a future pull to ever surface the collision
   * (see lib/db/reconcile-identity.ts's DUPLICATE_NAME_TABLES). */
  id_map?: Record<string, Record<string, string>>;
  /** Record id -> server-assigned new `_version`, grouped by table_name, for
   * UPDATE changes accepted via SyncController::push's strict version-
   * equality check. Applied immediately to the local row (see push.ts) so
   * this device's very next edit is based on the true current server
   * version instead of a stale local counter — see
   * docs/features/_known-bugs.md #11. */
  versions?: Record<string, Record<string, number>>;
}

export interface PullResponse {
  success: boolean;
  server_timestamp: string;
  changes: Record<string, Record<string, unknown>[]>;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: unknown;
}

/** Row shape for the `_sync_queue` table. */
export interface SyncQueueItem {
  id: number;
  table_name: string;
  record_id: string;
  operation: string;
  payload: string;
  created_at: string;
  retry_count?: number;
  last_error?: string;
  next_retry_at?: string;
}

/** A queued sync item with its JSON `payload` parsed and sync-bookkeeping
 * fields (_deleted/_version/_synced/_synced_at) stripped, ready to push. */
export interface SyncChange extends Omit<SyncQueueItem, "payload"> {
  payload: Record<string, unknown>;
}

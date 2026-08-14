export interface PushResponse {
  success: boolean;
  message?: string;
  processed?: number;
  /** Changes the server isolated to their own savepoint and skipped
   * individually rather than failing the whole batch — see
   * SyncController::push. */
  failed?: { id: number; table_name: string; record_id: string; reason: string }[];
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

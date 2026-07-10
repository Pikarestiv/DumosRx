export interface PushResponse {
  success: boolean;
  message?: string;
  processed?: number;
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

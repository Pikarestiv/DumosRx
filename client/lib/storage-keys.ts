import type { RecentUser } from "@/lib/types/user";

export const STORAGE_KEYS = {
  authToken: "auth_token",
  authTokenIssuedAt: "auth_token_issued_at",
  user: "dumos_user",
  recentUsers: "dumos_recent_users",
  activeStoreId: "dumos_active_store_id",
  lastSyncTime: "last_sync_time",
  suggestions: "dumos_suggestions",
  apiUrl: "dumos_api_url",
  posCart: "pos-cart-storage",
  orphanRequeueMarker: "dumos_orphan_requeue_v1",
  deviceId: "dumos_device_id",
  impersonatedUser: "dumos_impersonated_user",
  impersonatorReturnCode: "impersonator_handoff_return_code",
  pendingCrashes: "dumosrx_pending_crashes",
  clearedLegacyV2: "dumosrx_cleared_legacy_v2",
  justRestored: "dumos_just_restored",
  lastAuditLogPrune: "dumos_last_audit_log_prune",
  lastSyncHealthCheck: "dumos_last_sync_health_check",
  syncHealthDeficitState: "dumos_sync_health_deficit_state",
  syncUniqueSkipCounts: "dumos_sync_unique_skip_counts",
  loginLockout: "dumos_login_lockout",
  tourCompleted: "dumos_client_tour_completed",
  tourSnoozedUntil: "dumos_client_tour_snoozed_until",
  widgetPromptDismissed: "dumos_widget_prompt_dismissed",
  sidebarCollapsed: "sidebar_collapsed",
  sidebarPeekEnabled: "sidebar_peek_enabled",
  receiptPaperSize: "receipt_paper_size",
  recentDownloads: "drx_recent_downloads",
  exportColumns: "drx_export_columns",
  chunkReloadGuard: "chunk-error-reload-attempted",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function read(key: StorageKey): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: StorageKey, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.error(`Failed to persist ${key}`, err);
  }
}

function remove(key: StorageKey): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function readJsonItem<T>(key: StorageKey, fallback: T): T {
  const raw = read(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Failed to parse ${key} from storage`, err);
    return fallback;
  }
}

export function writeJsonItem(key: StorageKey, value: unknown): void {
  write(key, JSON.stringify(value));
}

/** The `dumos_user` snapshot. Deliberately loose: different call sites read
 * different fields off it, and it is written from more than one flow. */
export interface StoredUserSnapshot {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  username?: string;
  email?: string;
  role?: string;
  store_id?: string;
  [key: string]: unknown;
}

export function getAuthToken(): string | null {
  return read(STORAGE_KEYS.authToken);
}

export function setAuthToken(token: string): void {
  write(STORAGE_KEYS.authToken, token);
}

export function clearAuthToken(): void {
  remove(STORAGE_KEYS.authToken);
}

export function getAuthTokenIssuedAt(): string | null {
  return read(STORAGE_KEYS.authTokenIssuedAt);
}

export function setAuthTokenIssuedAt(issuedAtMs: number): void {
  write(STORAGE_KEYS.authTokenIssuedAt, String(issuedAtMs));
}

export function clearAuthTokenIssuedAt(): void {
  remove(STORAGE_KEYS.authTokenIssuedAt);
}

export function getStoredUser(): StoredUserSnapshot | null {
  return readJsonItem<StoredUserSnapshot | null>(STORAGE_KEYS.user, null);
}

export function setStoredUser(user: unknown): void {
  writeJsonItem(STORAGE_KEYS.user, user);
}

export function clearStoredUser(): void {
  remove(STORAGE_KEYS.user);
}

export function getRecentUsers(): RecentUser[] {
  return readJsonItem<RecentUser[]>(STORAGE_KEYS.recentUsers, []);
}

export function setRecentUsers(users: RecentUser[]): void {
  writeJsonItem(STORAGE_KEYS.recentUsers, users);
}

export function clearRecentUsers(): void {
  remove(STORAGE_KEYS.recentUsers);
}

/**
 * The store id the API client stamps on `X-Store-Id`. Named `…Stored…` to
 * keep it distinct from `core.ts`'s `getActiveStoreId()`, which resolves the
 * store id used for local queries — the two having drifted apart is the bug
 * class A-23 exists to prevent (see `auth-context.tsx`).
 */
export function getStoredActiveStoreId(): string | null {
  return read(STORAGE_KEYS.activeStoreId);
}

export function setStoredActiveStoreId(storeId: string): void {
  write(STORAGE_KEYS.activeStoreId, storeId);
}

export function getLastSyncTime(): string | null {
  return read(STORAGE_KEYS.lastSyncTime);
}

export function setLastSyncTime(isoTimestamp: string): void {
  write(STORAGE_KEYS.lastSyncTime, isoTimestamp);
}

export function clearLastSyncTime(): void {
  remove(STORAGE_KEYS.lastSyncTime);
}

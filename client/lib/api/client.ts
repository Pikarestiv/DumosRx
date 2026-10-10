import { FleetBillingApiClient } from "./client-fleet-billing";
import type { Broadcast } from "@/lib/types/broadcast";
import type { SyncChange } from "@/lib/types/sync";
import type { CurrentUser, Session } from "@/lib/types/user";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { getStoredActiveStoreId, getStoredUser } from "@/lib/storage-keys";
import { APP_VERSION, BUILD_SHA } from "@/lib/constants";

/**
 * The device/store/actor stamp every sync call carries. X-Acting-User-Id is
 * the locally signed-in user, which is the only place that fact exists: a
 * staff PIN login never mints its own API token, so the bearer always names
 * the account that linked the device. Self-asserted, and the server treats it
 * as visibility only - see A-202 and laravel-server/AGENTS.md.
 *
 * X-App-Version/X-Build-Sha name the bundle. Unlike the stamp above these
 * are load-bearing: the server refuses Health Sync below a minimum version
 * (A-213), and an absent header means "too old".
 */
function syncHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window === "undefined") {
    return headers;
  }

  const activeStoreId = getStoredActiveStoreId();
  if (activeStoreId) {
    headers["X-Store-Id"] = activeStoreId;
  }
  headers["X-Device-Id"] = getDeviceId();
  headers["X-Device-Label"] = getDeviceLabel();
  headers["X-App-Version"] = APP_VERSION;
  headers["X-Build-Sha"] = BUILD_SHA;

  const actingUserId = getStoredUser()?.id;
  if (actingUserId) {
    headers["X-Acting-User-Id"] = actingUserId;
  }

  return headers;
}

class ApiClient extends FleetBillingApiClient {
  // Auth endpoints
  async login(email: string, password: string) {
    return this.request<{
      token: string;
      user: {
        id: string;
        email: string;
        name: string;
        role: string;
      };
      message: string;
    }>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password, device_name: "Client App" }),
    });
  }

  async register(payload: {
    first_name: string;
    last_name: string;
    email: string;
    username?: string;
    pin?: string;
    password: string;
    store_name: string;
    store_type?: string;
    phone?: string;
  }) {
    return this.request<{
      message: string;
      user: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
      };
      token: string;
    }>("/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getProfile() {
    return this.request<CurrentUser>("/user");
  }

  async updateProfile(payload: { first_name: string; last_name: string; phone?: string | null }) {
    return this.request<{ message: string; user: CurrentUser }>("/profile/update", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getSessions() {
    return this.request<Session[]>("/sessions");
  }

  async revokeSession(id: string) {
    return this.request<{ message: string }>(`/sessions/${id}`, {
      method: "DELETE",
    });
  }

  async revokeAllSessions() {
    return this.request<{ message: string }>("/sessions/revoke-all", {
      method: "POST",
    });
  }

  // The request body's `token` is the sole credential here; the endpoint
  // does not read the Authorization header at all (see AuthHandoffController),
  // so no explicit header override is set.
  async createHandoffCode(token: string) {
    return this.request<{ code: string; expires_in: number }>("/auth/handoff", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async consumeHandoffCode(code: string) {
    return this.request<{
      token: string;
      // Mirrors the raw App\Models\User JSON the endpoint returns (fillable
      // columns plus the appended `name` accessor).
      user: {
        id: string;
        email: string;
        name: string;
        role: string;
        first_name: string;
        last_name: string;
        username: string;
        store_id?: string;
      };
    }>("/auth/handoff/consume", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  // Sync Endpoints
  async pushChanges(
    payload: {
      changes: SyncChange[];
      stock_fingerprint?: { batch_count: number; quantity_sum: number } | null;
      queue_state?: unknown;
      sync_command_results?: unknown;
    },
    isManual: boolean = false,
    isSetup: boolean = false,
    // One token per sync() call, repeated on every batch of that run. The
    // server measures the plan's sync-interval throttle per RUN rather than
    // per request, so a backlog spanning many batches isn't rejected by its
    // own first batch — see SyncController::validateSync.
    runId?: string,
  ) {
    let url = `/app/sync/push`;
    const params = new URLSearchParams();
    if (isManual) params.append("manual", "1");
    if (isSetup) params.append("setup", "1");
    if (params.toString()) url += `?${params.toString()}`;

    const headers: Record<string, string> = syncHeaders();
    if (runId) headers["X-Sync-Run-Id"] = runId;

    return this.request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  // Which OTHER devices in this store are behind on sync - a question only
  // the server can answer. Consumed by the stock-count warning (A-211).
  async getPeerSyncFreshness(): Promise<{
    success: boolean;
    threshold_minutes: number;
    stale_devices: {
      device_id: string;
      device_label: string | null;
      last_synced_at: string | null;
      minutes_behind: number | null;
    }[];
  }> {
    return this.request("/app/sync/peer-freshness", { headers: syncHeaders() });
  }

  // Authoritative row counts, per table, for the caller's store - not a
  // pull, just COUNT(*)s a device periodically checks itself against. See
  // lib/db/sync-engine/health-check.ts for why this exists.
  async getSyncCounts(): Promise<{ success: boolean; counts: Record<string, number> }> {
    const headers = syncHeaders();

    return this.request("/app/sync/counts", { headers });
  }

  // Hands the server this device's own stock_batches.quantity snapshot so it
  // can adopt any value it never derived from a movement delta. See
  // lib/db/sync-engine/reconcile-quantities.ts.
  async reconcileStockQuantities(payload: {
    batches: { id: string; quantity: number }[];
  }): Promise<{
    success: boolean;
    reconciled: number;
    checked: number;
    movements?: {
      id: string;
      stock_batch_id: string;
      product_id: string;
      store_id: string;
      movement_type: string;
      quantity: number;
      reason: string | null;
      performed_by: string | null;
      movement_date: string;
      created_at: string;
      updated_at: string;
    }[];
  }> {
    const headers = syncHeaders();

    return this.request("/app/sync/reconcile-quantities", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  async pullChanges(
    payload: {
      last_synced: Record<string, string>;
      page_offset?: Record<string, number>;
      page_cursor?: Record<string, { updated_at: string; id: string }>;
    },
    isManual: boolean = false,
    isSetup: boolean = false,
    // See pushChanges' own runId note.
    runId?: string,
  ) {
    let url = `/app/sync/pull`;
    const params = new URLSearchParams();
    if (isManual) params.append("manual", "1");
    if (isSetup) params.append("setup", "1");
    if (params.toString()) url += `?${params.toString()}`;

    const headers: Record<string, string> = syncHeaders();
    if (runId) headers["X-Sync-Run-Id"] = runId;

    return this.request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  // Broadcasts
  async getBroadcasts(storeId?: string) {
    const headers: Record<string, string> = storeId ? { "X-Store-ID": storeId } : {};
    return this.request<{ success: boolean; data: Broadcast[] }>(
      "/announcements",
      { headers },
    );
  }

  // System Configurations
  async getSystemConfig<T = unknown>(key: string) {
    const response = await this.request<{ data: T }>(`/system-configs/${key}`);
    return response.data;
  }

}

export const apiClient = new ApiClient();

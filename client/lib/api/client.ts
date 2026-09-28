import { FleetBillingApiClient } from "./client-fleet-billing";
import type { Broadcast } from "@/lib/types/broadcast";
import type { SyncChange } from "@/lib/types/sync";
import type { CurrentUser, Session } from "@/lib/types/user";
import { getDeviceId } from "@/lib/utils/device-id";

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
    payload: { changes: SyncChange[] },
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

    const headers: Record<string, string> = {};
    if (runId) headers["X-Sync-Run-Id"] = runId;
    if (typeof window !== "undefined") {
      const activeStoreId = localStorage.getItem("dumos_active_store_id");
      if (activeStoreId) {
        headers["X-Store-Id"] = activeStoreId;
      }
      headers["X-Device-Id"] = getDeviceId();
    }

    return this.request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  // Authoritative row counts, per table, for the caller's store - not a
  // pull, just COUNT(*)s a device periodically checks itself against. See
  // lib/db/sync-engine/health-check.ts for why this exists.
  async getSyncCounts(): Promise<{ success: boolean; counts: Record<string, number> }> {
    const headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const activeStoreId = localStorage.getItem("dumos_active_store_id");
      if (activeStoreId) {
        headers["X-Store-Id"] = activeStoreId;
      }
      headers["X-Device-Id"] = getDeviceId();
    }

    return this.request("/app/sync/counts", { headers });
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

    const headers: Record<string, string> = {};
    if (runId) headers["X-Sync-Run-Id"] = runId;
    if (typeof window !== "undefined") {
      const activeStoreId = localStorage.getItem("dumos_active_store_id");
      if (activeStoreId) {
        headers["X-Store-Id"] = activeStoreId;
      }
      headers["X-Device-Id"] = getDeviceId();
    }

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

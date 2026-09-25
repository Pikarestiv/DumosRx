import { FleetBillingApiClient } from "./client-fleet-billing";
import type { CustomerFormPayload } from "@/lib/types/customer";
import type { Broadcast } from "@/lib/types/broadcast";
import type { NewProductPayload } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";
import type { SyncChange } from "@/lib/types/sync";
import type { CurrentUser, Session } from "@/lib/types/user";
import { getDeviceId } from "@/lib/utils/device-id";

/** Loose shape shared by the legacy cloud list/aggregate endpoints below:
 * callers only ever read `.total`/`.count`/`.data?.length`/`.revenue`. */
interface CloudListResponse {
  total?: number;
  count?: number;
  revenue?: number;
  data?: unknown[];
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

  // NOTE: the endpoints below (products/sales/customers/categories/suppliers/
  // stock-movements/purchase-orders/stock-adjustments/prescriptions cloud CRUD)
  // predate the offline-first SQLite architecture and have no callers left in
  // the app (superseded by lib/db/queries/*); typed loosely since their
  // response shape is unused, not because it's unknowable.
  async getProducts(page = 1, limit = 50) {
    return this.request<CloudListResponse>(`/app/products?page=${page}&limit=${limit}`);
  }

  async searchProducts(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params);
    return this.request<unknown>(`/app/products/search?${searchParams}`);
  }

  async getProduct(id: string) {
    return this.request<unknown>(`/app/products/${id}`);
  }

  async createProduct(data: NewProductPayload) {
    return this.request<unknown>("/app/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Stock Batch endpoints
  async getStockBatch(page = 1, limit = 50) {
    return this.request<unknown>(`/app/stock-batches?page=${page}&limit=${limit}`);
  }

  async getLowStockItems() {
    return this.request<CloudListResponse>("/app/stock-batches/low-stock");
  }

  async getExpiringItems(days = 90) {
    return this.request<CloudListResponse>(`/app/stock-batches/expiring?days=${days}`);
  }

  async getStockBatchValue() {
    return this.request<unknown>("/app/stock-batches/value");
  }

  // Sales endpoints
  async createSale(data: Record<string, unknown>) {
    return this.request<unknown>("/app/sales", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSales(page = 1, limit = 50) {
    return this.request<unknown>(`/app/sales?page=${page}&limit=${limit}`);
  }

  async getDailySales(date?: string) {
    const params = date ? `?date=${date}` : "";
    return this.request<CloudListResponse>(`/app/sales/daily${params}`);
  }

  async getTopSellingProducts(limit = 10, days = 30) {
    return this.request<unknown>(`/app/sales/top-products?limit=${limit}&days=${days}`);
  }

  // Customers endpoints
  async getCustomers(page = 1, limit = 50) {
    return this.request<unknown>(`/app/customers?page=${page}&limit=${limit}`);
  }

  async createCustomer(data: CustomerFormPayload) {
    return this.request<unknown>("/app/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Categories endpoints
  async getCategories() {
    return this.request<unknown>("/app/categories");
  }

  // Dashboard endpoints
  //
  // There is deliberately no getDashboardStats() here. One used to exist,
  // unused, assembling dashboard-shaped numbers (totalProducts,
  // dailySalesRevenue, expiringSoon, lowStockCount) from the cloud API -
  // server-side, not netted of refunds, and bucketed by UTC day. It looked
  // like a drop-in replacement for the real dashboard figures, which come
  // from the local SQLite queries (getDashboardOverviewData /
  // getStockBatchStats) and are refund-netted and bucketed by the store's
  // LOCAL day. Do not reintroduce it: the dashboard reads local data.
  async getRecentActivity(limit = 5) {
    return this.request<CloudListResponse>(`/activity?limit=${limit}`).catch(
      (): CloudListResponse => ({ data: [] }),
    );
  }

  // Suppliers endpoints
  async getSuppliers(page = 1, limit = 50) {
    return this.request<unknown>(`/app/suppliers?page=${page}&limit=${limit}`);
  }

  async createSupplier(data: SupplierPayload) {
    return this.request<unknown>("/app/suppliers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Stock Movements endpoints
  async getStockMovements(page = 1, limit = 50) {
    return this.request<CloudListResponse>(
      `/stock-movements?page=${page}&limit=${limit}`,
    ).catch((): CloudListResponse => ({ data: [] }));
  }

  // Purchase Orders endpoints
  async getPurchaseOrders(page = 1, limit = 50) {
    return this.request<CloudListResponse>(
      `/purchase-orders?page=${page}&limit=${limit}`,
    ).catch((): CloudListResponse => ({ data: [] }));
  }

  // Stock Adjustments endpoints
  async getStockAdjustments(page = 1, limit = 50) {
    return this.request<CloudListResponse>(
      `/stock-adjustments?page=${page}&limit=${limit}`,
    ).catch((): CloudListResponse => ({ data: [] }));
  }

  // Prescriptions endpoints
  async getPrescriptions(page = 1, limit = 50) {
    return this.request<CloudListResponse>(
      `/prescriptions?page=${page}&limit=${limit}`,
    ).catch((): CloudListResponse => ({ data: [] }));
  }

  // Sync Endpoints
  async pushChanges(
    payload: { changes: SyncChange[] },
    isManual: boolean = false,
    isSetup: boolean = false,
  ) {
    let url = `/app/sync/push`;
    const params = new URLSearchParams();
    if (isManual) params.append("manual", "1");
    if (isSetup) params.append("setup", "1");
    if (params.toString()) url += `?${params.toString()}`;

    const headers: Record<string, string> = {};
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
    },
    isManual: boolean = false,
    isSetup: boolean = false,
  ) {
    let url = `/app/sync/pull`;
    const params = new URLSearchParams();
    if (isManual) params.append("manual", "1");
    if (isSetup) params.append("setup", "1");
    if (params.toString()) url += `?${params.toString()}`;

    const headers: Record<string, string> = {};
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

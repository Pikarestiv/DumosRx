import { BaseApiClient } from "./base-client";
import type { CustomerFormPayload } from "@/lib/types/customer";
import type { Broadcast } from "@/lib/types/broadcast";
import type { NewProductPayload } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";
import type { SyncChange } from "@/lib/types/sync";
import type { StoreOption, FleetStore, FleetStorePayload, FleetStats } from "@/lib/types/store";
import type { OnlineOrder } from "@/lib/types/online-order";
import type { CurrentUser, Session } from "@/lib/types/user";
import type {
  SubscriptionStatus,
  PaymentPayload,
  PaymentResponse,
  ReferralStats,
  CouponValidationResponse,
  BillingTransaction,
} from "@/lib/types/subscription-plans";

/** Loose shape shared by the legacy cloud list/aggregate endpoints below:
 * callers only ever read `.total`/`.count`/`.data?.length`/`.revenue`. */
interface CloudListResponse {
  total?: number;
  count?: number;
  revenue?: number;
  data?: unknown[];
}

class ApiClient extends BaseApiClient {
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
  async getDashboardStats() {
    // Aggregate stats from multiple endpoints
    const [products, dailySales, expiringItems, lowStockItems] =
      await Promise.all([
        this.getProducts(1, 1).catch((): CloudListResponse => ({ total: 0 })),
        this.getDailySales().catch((): CloudListResponse => ({ total: 0, revenue: 0 })),
        this.getExpiringItems(30).catch((): CloudListResponse => ({ data: [] })),
        this.getLowStockItems().catch((): CloudListResponse => ({ data: [] })),
      ]);

    return {
      totalProducts: products.total || products.data?.length || 0,
      dailySalesRevenue: dailySales.revenue || dailySales.total || 0,
      expiringSoon: expiringItems.count || expiringItems.data?.length || 0,
      lowStockCount: lowStockItems.count || lowStockItems.data?.length || 0,
    };
  }

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
    }

    return this.request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  async pullChanges(
    payload: { last_synced: Record<string, string> },
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

  // Stores
  async getStores() {
    return this.request<StoreOption[]>("/stores");
  }

  async checkStoreSlug(slug: string, ignoreId?: string) {
    const url = `/stores/check-slug?slug=${encodeURIComponent(slug)}${ignoreId ? `&ignore_id=${ignoreId}` : ""}`;
    return this.request<{ available: boolean; slug: string }>(url);
  }

  async createStore(payload: FleetStorePayload) {
    return this.request<{ message: string; store: FleetStore }>("/stores", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateStore(id: string, payload: FleetStorePayload) {
    return this.request<{ message: string; store: FleetStore }>(`/stores/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async deleteStore(id: string) {
    return this.request<{ message: string }>(`/stores/${id}`, {
      method: "DELETE",
    });
  }

  async getFleetStats() {
    return this.request<FleetStats>("/dashboard/stats");
  }

  async getAccountManager() {
    return this.request<{
      data: { id: string; name: string; email: string; phone: string | null } | null;
    }>("/account-manager");
  }

  async sendEndOfDaySummary() {
    return this.request<{ message: string }>("/dashboard/send-summary", {
      method: "POST",
    });
  }

  // Subscription & Billing
  async getSubscriptionStatus() {
    return this.request<SubscriptionStatus>("/subscription/status");
  }

  async pay(payload: PaymentPayload) {
    return this.request<PaymentResponse>("/subscription/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getReferralStats() {
    return this.request<ReferralStats>("/subscription/referral-stats");
  }

  async validateCoupon(payload: { code: string; plan_name?: string; interval?: string }) {
    return this.request<CouponValidationResponse>("/subscription/validate-coupon", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async verifyPayment(reference: string) {
    return this.request<{ success: boolean; message?: string }>("/subscription/verify", {
      method: "POST",
      body: JSON.stringify({ reference }),
    });
  }

  async getBillingHistory() {
    return this.request<{ transactions: BillingTransaction[] }>("/subscription/billing-history");
  }

  // Notifications
  async getNotifications() {
    return this.request<unknown>("/alerts");
  }

  async markNotificationRead(id: string) {
    return this.request<unknown>(`/alerts/${id}/read`, {
      method: "POST",
    });
  }

  // Online Orders
  async getOnlineOrders() {
    return this.request<{ orders?: OnlineOrder[] }>("/app/online-orders");
  }

  async fulfillOnlineOrder(id: string) {
    return this.request<unknown>(`/app/online-orders/${id}/fulfill`, {
      method: "POST",
      body: JSON.stringify({ status: "fulfilled" }),
    });
  }

  // Danger zone
  async resetData(type: string, password: string) {
    return this.request<{ message: string }>("/dashboard/reset", {
      method: "POST",
      body: JSON.stringify({ type, password }),
    });
  }

  async requestAccountDeletion(payload: { reason: string; password: string }) {
    return this.request<{ message: string }>("/profile/request-deletion", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async cancelAccountDeletion() {
    return this.request<{ message: string }>("/profile/cancel-deletion", {
      method: "POST",
    });
  }
}

export const apiClient = new ApiClient();

import { BaseApiClient } from "./base-client";

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

  async getProfile() {
    return this.request<any>("/user");
  }

  // Products endpoints
  async getProducts(page = 1, limit = 50) {
    return this.request<any>(`/products?page=${page}&limit=${limit}`);
  }

  async searchProducts(params: any) {
    const searchParams = new URLSearchParams(params);
    return this.request<any>(`/products/search?${searchParams}`);
  }

  async getProduct(id: string) {
    return this.request<any>(`/products/${id}`);
  }

  async createProduct(data: any) {
    return this.request<any>("/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Stock Batch endpoints
  async getStockBatch(page = 1, limit = 50) {
    return this.request<any>(`/stock-batches?page=${page}&limit=${limit}`);
  }

  async getLowStockItems() {
    return this.request<any>("/stock-batches/low-stock");
  }

  async getExpiringItems(days = 90) {
    return this.request<any>(`/stock-batches/expiring?days=${days}`);
  }

  async getStockBatchValue() {
    return this.request<any>("/stock-batches/value");
  }

  // Sales endpoints
  async createSale(data: any) {
    return this.request<any>("/sales", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSales(page = 1, limit = 50) {
    return this.request<any>(`/sales?page=${page}&limit=${limit}`);
  }

  async getDailySales(date?: string) {
    const params = date ? `?date=${date}` : "";
    return this.request<any>(`/sales/daily${params}`);
  }

  async getTopSellingProducts(limit = 10, days = 30) {
    return this.request<any>(`/sales/top-products?limit=${limit}&days=${days}`);
  }

  // Customers endpoints
  async getCustomers(page = 1, limit = 50) {
    return this.request<any>(`/customers?page=${page}&limit=${limit}`);
  }

  async createCustomer(data: any) {
    return this.request<any>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Categories endpoints
  async getCategories() {
    return this.request<any>("/categories");
  }

  // Dashboard endpoints
  async getDashboardStats() {
    // Aggregate stats from multiple endpoints
    const [products, dailySales, expiringItems, lowStockItems] =
      await Promise.all([
        this.getProducts(1, 1).catch(() => ({ total: 0 })),
        this.getDailySales().catch(() => ({ total: 0, revenue: 0 })),
        this.getExpiringItems(30).catch(() => ({ data: [] })),
        this.getLowStockItems().catch(() => ({ data: [] })),
      ]);

    return {
      totalProducts: products.total || products.data?.length || 0,
      dailySalesRevenue: dailySales.revenue || dailySales.total || 0,
      expiringSoon: expiringItems.count || expiringItems.data?.length || 0,
      lowStockCount: lowStockItems.count || lowStockItems.data?.length || 0,
    };
  }

  async getRecentActivity(limit = 5) {
    return this.request<any>(`/activity?limit=${limit}`).catch(() => ({
      data: [],
    }));
  }

  // Suppliers endpoints
  async getSuppliers(page = 1, limit = 50) {
    return this.request<any>(`/suppliers?page=${page}&limit=${limit}`);
  }

  async createSupplier(data: any) {
    return this.request<any>("/suppliers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Stock Movements endpoints
  async getStockMovements(page = 1, limit = 50) {
    return this.request<any>(
      `/stock-movements?page=${page}&limit=${limit}`,
    ).catch(() => ({ data: [] }));
  }

  // Purchase Orders endpoints
  async getPurchaseOrders(page = 1, limit = 50) {
    return this.request<any>(
      `/purchase-orders?page=${page}&limit=${limit}`,
    ).catch(() => ({ data: [] }));
  }

  // Stock Adjustments endpoints
  async getStockAdjustments(page = 1, limit = 50) {
    return this.request<any>(
      `/stock-adjustments?page=${page}&limit=${limit}`,
    ).catch(() => ({ data: [] }));
  }

  // Prescriptions endpoints
  async getPrescriptions(page = 1, limit = 50) {
    return this.request<any>(
      `/prescriptions?page=${page}&limit=${limit}`,
    ).catch(() => ({ data: [] }));
  }

  // Sync Endpoints
  async pushChanges(
    payload: { changes: any[] },
    isManual: boolean = false,
    isSetup: boolean = false,
  ) {
    let url = `/sync/push`;
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
    let url = `/sync/pull`;
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
  async getBroadcasts() {
    return this.request<any>("/announcements");
  }

  // System Configurations
  async getSystemConfig(key: string) {
    const response = await this.request<any>(`/system-configs/${key}`);
    return response.data;
  }

  // Stores
  async getStores() {
    return this.request<any[]>("/stores");
  }

  async checkStoreSlug(slug: string, ignoreId?: string) {
    const url = `/stores/check-slug?slug=${encodeURIComponent(slug)}${ignoreId ? `&ignore_id=${ignoreId}` : ""}`;
    return this.request<{ available: boolean; slug: string }>(url);
  }

  // Notifications
  async getNotifications() {
    return this.request<any>("/alerts");
  }

  async markNotificationRead(id: string) {
    return this.request<any>(`/alerts/${id}/read`, {
      method: "POST",
    });
  }

  // Online Orders
  async getOnlineOrders() {
    return this.request<any>("/online-orders");
  }

  async fulfillOnlineOrder(id: string) {
    return this.request<any>(`/online-orders/${id}/fulfill`, {
      method: "POST",
      body: JSON.stringify({ status: "fulfilled" }),
    });
  }
}

export const apiClient = new ApiClient();

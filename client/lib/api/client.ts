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
    return this.request<any>("/auth/profile");
  }

  // Medicines endpoints
  async getMedicines(page = 1, limit = 50) {
    return this.request<any>(`/medicines?page=${page}&limit=${limit}`);
  }

  async searchMedicines(params: any) {
    const searchParams = new URLSearchParams(params);
    return this.request<any>(`/medicines/search?${searchParams}`);
  }

  async getMedicine(id: string) {
    return this.request<any>(`/medicines/${id}`);
  }

  async createMedicine(data: any) {
    return this.request<any>("/medicines", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Inventory endpoints
  async getInventory(page = 1, limit = 50) {
    return this.request<any>(`/inventory?page=${page}&limit=${limit}`);
  }

  async getLowStockItems() {
    return this.request<any>("/inventory/low-stock");
  }

  async getExpiringItems(days = 90) {
    return this.request<any>(`/inventory/expiring?days=${days}`);
  }

  async getInventoryValue() {
    return this.request<any>("/inventory/value");
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

  async getTopSellingMedicines(limit = 10, days = 30) {
    return this.request<any>(
      `/sales/top-medicines?limit=${limit}&days=${days}`,
    );
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
    const [medicines, dailySales, expiringItems, lowStockItems] =
      await Promise.all([
        this.getMedicines(1, 1).catch(() => ({ total: 0 })),
        this.getDailySales().catch(() => ({ total: 0, revenue: 0 })),
        this.getExpiringItems(30).catch(() => ({ data: [] })),
        this.getLowStockItems().catch(() => ({ data: [] })),
      ]);

    return {
      totalMedicines: medicines.total || medicines.data?.length || 0,
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
  async pushChanges(payload: { changes: any[] }) {
    return this.request("/sync/push", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async pullChanges(payload: { last_synced: Record<string, string> }) {
    return this.request("/sync/pull", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // Broadcasts
  async getBroadcasts() {
    return this.request<any>("/announcements");
  }

  // System Configurations
  async getSystemConfig(key: string) {
    return this.request<any>(`/system-configs/${key}`);
  }
}

export const apiClient = new ApiClient();

import { API_BASE_URL } from "../constants";

class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || API_BASE_URL;

    // Load token from localStorage on client side
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_token_issued_at", Date.now().toString());
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_token_issued_at");
    }
  }

  private async refreshTokenSilently(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const url = `${this.baseURL}/refresh`;
        const currentToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") || this.token : this.token;
        
        if (!currentToken) return;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            this.setToken(data.token);
          }
        } else {
          this.clearToken();
        }
      } catch (error) {
        console.error("Silent token refresh failed:", error);
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    // Intercept to silently refresh token if it's older than 7 days
    if (typeof window !== "undefined" && !endpoint.includes("/login") && !endpoint.includes("/refresh")) {
      const issuedAtStr = localStorage.getItem("auth_token_issued_at");
      if (issuedAtStr && navigator.onLine) {
        const issuedAt = parseInt(issuedAtStr, 10);
        if (Date.now() - issuedAt > this.REFRESH_THRESHOLD_MS) {
          await this.refreshTokenSilently();
        }
      }
    }

    const url = `${this.baseURL}${endpoint}`;

    // Dynamic token retrieval for client-side
    const currentToken =
      typeof window !== "undefined"
        ? localStorage.getItem("auth_token") || this.token
        : this.token;

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.clearToken();
        }
        const errorMessage =
          errorData.message || `HTTP error! status: ${response.status}`;
        const serverError = errorData.error
          ? ` - ${typeof errorData.error === "string" ? errorData.error : JSON.stringify(errorData.error)}`
          : "";
        throw new Error(errorMessage + serverError);
      }

      return await response.json();
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  }

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
    return this.request<any>("/broadcasts");
  }
}

export const apiClient = new ApiClient();

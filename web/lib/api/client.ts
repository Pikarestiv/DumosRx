const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
};

class WebApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  public async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith('/admin');
    const tokenKey = isAdminPath ? "drx_admin_token" : "drx_token";
    const token = typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const config: RequestInit = {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "include", // Allow sending and receiving cookies
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || `Request failed with status ${response.status}`,
      );
    }

    return data;
  }

  async register(payload: {
    pharmacy_name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    password: string;
    password_confirmation: string;
  }) {
    return this.request<{
      user: any;
      token: string;
      message: string;
    }>("/register", {
      method: "POST",
      body: {
        ...payload,
        device_name: "Web Client",
      },
    });
  }

  async login(payload: { email: string; password: string }) {
    return this.request<{
      user: any;
      token: string;
      message: string;
    }>("/login", {
      method: "POST",
      body: {
        ...payload,
        device_name: "Web Client",
      },
    });
  }

  async getSubscriptionStatus() {
    return this.request<{
      status: string;
      plan?: string;
      days_remaining?: number;
    }>("/subscription/status");
  }

  async initiatePayment(payload: {
    amount: number;
    provider: "paystack" | "flutterwave";
  }) {
    return this.request<{
      message: string;
      transaction_reference: string;
      payment_url?: string;
    }>("/subscription/pay", {
      method: "POST",
      body: payload,
    });
  }

  async getDashboardSummary() {
    return this.request<{
      stats: {
        total_sales: number;
        inventory_value: number;
        total_customers: number;
        active_stores: number;
      };
      recent_sales: any[];
      user: {
        name: string;
        email: string;
        pharmacy_name: string;
      };
      staff: any[]; // Include staff in summary or separate call
    }>("/dashboard/summary");
  }

  async getStaff(storeId?: string) {
    const endpoint = storeId && storeId !== 'all' ? `/staff?store_id=${storeId}` : "/staff";
    return this.request<any[]>(endpoint);
  }

  async createStaff(payload: any) {
    return this.request<any>("/staff", {
      method: "POST",
      body: payload,
    });
  }

  async updateStaff(id: string, payload: any) {
    return this.request<any>(`/staff/${id}`, {
      method: "PUT",
      body: payload,
    });
  }

  async deleteStaff(id: string) {
    return this.request<any>(`/staff/${id}`, {
      method: "DELETE",
    });
  }

  async getNotifications() {
    return this.request<any[]>("/notifications");
  }

  async resetData(type: string = "all") {
    return this.request<{ message: string; status: string }>("/dashboard/reset", {
      method: "POST",
      body: { type },
    });
  }
}

export const webApiClient = new WebApiClient(API_URL);

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

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const token = typeof window !== "undefined" ? localStorage.getItem("drx_token") : null;

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
    }>("/dashboard/summary");
  }
}

export const webApiClient = new WebApiClient(API_URL);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
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
}

export const webApiClient = new WebApiClient(API_URL);

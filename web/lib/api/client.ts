import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
});

// Request interceptor for token fallback
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    const tokenKey = isAdminPath ? "drx_admin_token" : "drx_token";
    const token = localStorage.getItem(tokenKey);
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor for 401 refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/login') && !originalRequest.url.includes('/refresh')) {
      originalRequest._retry = true;
      
      try {
        const { data } = await axios.post(`${API_URL}/refresh`, {}, { withCredentials: true });
        
        if (data.token && typeof window !== "undefined") {
          const isAdminPath = window.location.pathname.startsWith('/admin');
          const tokenKey = isAdminPath ? "drx_admin_token" : "drx_token";
          localStorage.setItem(tokenKey, data.token);
          
          originalRequest.headers.Authorization = `Bearer ${data.token}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        if (typeof window !== "undefined") {
          const isAdminPath = window.location.pathname.startsWith('/admin');
          const tokenKey = isAdminPath ? "drx_admin_token" : "drx_token";
          localStorage.removeItem(tokenKey);
          window.location.href = isAdminPath ? "/admin/login" : "/login";
        }
      }
    }
    
    return Promise.reject(error);
  }
);

class WebApiClient {
  async register(payload: any) {
    const { data } = await apiClient.post("/register", { ...payload, device_name: "web" });
    return data;
  }

  async login(payload: any) {
    const { data } = await apiClient.post("/login", { ...payload, device_name: "web" });
    return data;
  }

  async getSubscriptionStatus() {
    const { data } = await apiClient.get("/subscription/status");
    return data;
  }

  async initiatePayment(payload: any) {
    const { data } = await apiClient.post("/subscription/pay", payload);
    return data;
  }

  async getDashboardSummary() {
    const { data } = await apiClient.get("/dashboard/summary");
    return data;
  }

  async getStaff(storeId?: string) {
    const endpoint = storeId && storeId !== 'all' ? `/staff?store_id=${storeId}` : "/staff";
    const { data } = await apiClient.get(endpoint);
    return data;
  }

  async createStaff(payload: any) {
    const { data } = await apiClient.post("/staff", payload);
    return data;
  }

  async updateStaff(id: string, payload: any) {
    const { data } = await apiClient.put(`/staff/${id}`, payload);
    return data;
  }

  async deleteStaff(id: string) {
    const { data } = await apiClient.delete(`/staff/${id}`);
    return data;
  }

  async getNotifications() {
    const { data } = await apiClient.get("/notifications");
    return data;
  }

  async resetData(type: string = "all") {
    const { data } = await apiClient.post("/dashboard/reset", { type });
    return data;
  }

  async createStore(payload: any) {
    const { data } = await apiClient.post("/stores", payload);
    return data;
  }

  async updateStore(id: string, payload: any) {
    const { data } = await apiClient.put(`/stores/${id}`, payload);
    return data;
  }

  async deleteStore(id: string) {
    const { data } = await apiClient.delete(`/stores/${id}`);
    return data;
  }

  async updateProfile(payload: any) {
    const { data } = await apiClient.post("/profile/update", payload);
    return data;
  }

  async setPin(pin: string) {
    const { data } = await apiClient.post("/profile/set-pin", { pin });
    return data;
  }

  async changePassword(payload: any) {
    const { data } = await apiClient.post("/profile/change-password", payload);
    return data;
  }

  async forgotPassword(email: string) {
    const { data } = await apiClient.post("/forgot-password", { email });
    return data;
  }

  async resetPassword(payload: any) {
    const { data } = await apiClient.post("/reset-password", payload);
    return data;
  }

  async post(url: string, payload: any) {
    const { data } = await apiClient.post(url, payload);
    return data;
  }

  async request<T>(url: string, options: any = {}): Promise<T> {
    const response = await apiClient({
      url,
      method: options.method || "GET",
      data: options.body,
      ...options,
    });
    return response.data;
  }
}

export const webApiClient = new WebApiClient();
export default apiClient;

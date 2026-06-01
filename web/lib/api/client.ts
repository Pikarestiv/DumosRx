import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface ApiLogEntry {
  timestamp: string;
  type: "request" | "response" | "error";
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  payload?: any;
  error?: any;
}

// In-memory circular log buffer
if (typeof window !== "undefined") {
  (window as any).__DRX_API_LOGS__ = (window as any).__DRX_API_LOGS__ || [];
}

const addLogToBuffer = (entry: ApiLogEntry) => {
  if (typeof window === "undefined") return;
  const win = window as any;
  win.__DRX_API_LOGS__ = win.__DRX_API_LOGS__ || [];
  win.__DRX_API_LOGS__.push(entry);
  if (win.__DRX_API_LOGS__.length > 50) {
    win.__DRX_API_LOGS__.shift();
  }
};

const sanitizePayload = (payload: any): any => {
  if (!payload) return payload;
  
  try {
    let parsed = payload;
    if (typeof payload === "string") {
      parsed = JSON.parse(payload);
    }
    
    if (typeof parsed === "object") {
      const sanitized = Array.isArray(parsed) ? [...parsed] : { ...parsed };
      
      // Handle array truncation
      if (Array.isArray(sanitized)) {
        if (sanitized.length > 10) {
          return [
            `Array(${sanitized.length})`,
            ...sanitized.slice(0, 3).map(item => sanitizePayload(item)),
            "...truncated"
          ];
        }
        return sanitized.map(item => sanitizePayload(item));
      }
      
      // Mask sensitive keys
      const sensitiveKeys = ["password", "token", "pin", "newpassword", "oldpassword", "credentials"];
      for (const key of Object.keys(sanitized)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
          sanitized[key] = "********";
        } else if (typeof sanitized[key] === "object") {
          sanitized[key] = sanitizePayload(sanitized[key]);
        }
      }
      return sanitized;
    }
    return parsed;
  } catch (_) {
    return payload;
  }
};

// Rate limiting & deduplication
let recentErrors: Array<{ timestamp: number; key: string }> = [];
const cleanRecentErrors = () => {
  const now = Date.now();
  recentErrors = recentErrors.filter(e => now - e.timestamp < 60000);
};

const shouldReportError = (method: string, url: string, status: number, message: string): boolean => {
  cleanRecentErrors();
  
  if (recentErrors.length >= 5) {
    return false;
  }
  
  const errorKey = `${method}:${url}:${status}:${message}`;
  if (recentErrors.some(e => e.key === errorKey)) {
    return false;
  }
  
  recentErrors.push({ timestamp: Date.now(), key: errorKey });
  return true;
};

const reportClientError = (method: string, url: string, status: number | undefined, message: string, details: any) => {
  if (url.includes("/logs/client-error")) return;
  if (!shouldReportError(method, url, status || 0, message)) return;
  
  try {
    const token = typeof window !== "undefined"
      ? localStorage.getItem(window.location.pathname.startsWith('/admin') ? "drx_admin_token" : "drx_token")
      : null;
      
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    fetch(`${API_URL}/logs/client-error`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        method,
        url,
        status: status || null,
        message,
        details: sanitizePayload(details),
      }),
      keepalive: true,
    }).catch(err => {
      console.warn("Failed to transmit error telemetry:", err);
    });
  } catch (_) {
    // Silently catch exceptions
  }
};

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
  (config as any).metadata = { startTime: Date.now() };

  if (typeof window !== "undefined") {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    const tokenKey = isAdminPath ? "drx_admin_token" : "drx_token";
    const token = localStorage.getItem(tokenKey);
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // Dev Request Logging
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    console.log(
      `%c[API Request] ${config.method?.toUpperCase()} ${config.url}`,
      "color: #6366f1; font-weight: bold;",
      {
        headers: config.headers,
        data: sanitizePayload(config.data),
      }
    );
  }

  // Add to buffer
  addLogToBuffer({
    timestamp: new Date().toISOString(),
    type: "request",
    method: config.method?.toUpperCase(),
    url: config.url,
    payload: sanitizePayload(config.data),
  });

  return config;
});

// Response interceptor for logging & 401 refresh
apiClient.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any).metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;

    // Add to buffer
    addLogToBuffer({
      timestamp: new Date().toISOString(),
      type: "response",
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs: duration,
      payload: sanitizePayload(response.data),
    });

    // Dev Response Logging
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      console.log(
        `%c[API Response] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status} (${duration || 0}ms)`,
        "color: #10b981; font-weight: bold;",
        {
          data: sanitizePayload(response.data),
        }
      );
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const startTime = originalRequest?.metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;
    const status = error.response?.status;
    const method = originalRequest?.method?.toUpperCase();
    const url = originalRequest?.url;
    const errorMessage = error.message || "Unknown error";
    const errorDetails = error.response?.data || error.stack;

    // Add to buffer
    addLogToBuffer({
      timestamp: new Date().toISOString(),
      type: "error",
      method,
      url,
      status,
      durationMs: duration,
      error: errorMessage,
      payload: sanitizePayload(errorDetails),
    });

    // Error logging
    if (typeof window !== "undefined") {
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        console.groupCollapsed(
          `%c[API Error] ${method} ${url} - Status: ${status || "NETWORK_ERROR"} (${duration || 0}ms)`,
          "color: #ef4444; font-weight: bold;"
        );
        console.error("Message:", errorMessage);
        console.log("Details:", errorDetails);
        console.log("Request Payload:", originalRequest ? sanitizePayload(originalRequest.data) : null);
        console.groupEnd();
      } else {
        console.error(`[API Error] ${method} ${url} - Status: ${status || "NETWORK_ERROR"} - ${errorMessage}`);
      }

      // Telemetry reporting for non-401 errors
      if (originalRequest && status !== 401 && !originalRequest.url?.includes("/logs/client-error")) {
        reportClientError(
          method || "UNKNOWN",
          url || "UNKNOWN",
          status,
          errorMessage,
          {
            details: errorDetails,
            requestData: originalRequest.data,
            durationMs: duration,
          }
        );
      }
    }
    
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
      } catch (_refreshError) {
        if (typeof window !== "undefined") {
          const isAdminPath = window.location.pathname.startsWith('/admin');
          const cleanPath = window.location.pathname.replace(/\/$/, "");
          const isAlreadyOnLoginPage = cleanPath === "/admin/login" || cleanPath === "/login";
          const tokenKey = isAdminPath ? "drx_admin_token" : "drx_token";
          localStorage.removeItem(tokenKey);
          if (!isAlreadyOnLoginPage) {
            window.location.href = isAdminPath ? "/admin/login/" : "/login/";
          }
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

  async getReferralStats() {
    const { data } = await apiClient.get("/subscription/referral-stats");
    return data;
  }

  async validateCoupon(payload: { code: string; plan_name?: string; interval?: string }) {
    const { data } = await apiClient.post("/subscription/validate-coupon", payload);
    return data;
  }

  async verifyPayment(reference: string) {
    const { data } = await apiClient.post("/subscription/verify", { reference });
    return data;
  }

  async getBillingHistory() {
    const { data } = await apiClient.get("/subscription/billing-history");
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
    const { data } = await apiClient.get("/alerts");
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

  async requestAccountDeletion(payload: { reason: string }) {
    const { data } = await apiClient.post("/profile/request-deletion", payload);
    return data;
  }
  
  async cancelAccountDeletion() {
    const { data } = await apiClient.post("/profile/cancel-deletion");
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

  // Broadcasts
  async getBroadcasts() {
    const { data } = await apiClient.get("/announcements");
    return data;
  }

  async adminGetBroadcasts() {
    const { data } = await apiClient.get("/admin/announcements");
    return data;
  }

  async createBroadcast(payload: any) {
    const { data } = await apiClient.post("/admin/announcements", payload);
    return data;
  }

  async updateBroadcast(id: string, payload: any) {
    const { data } = await apiClient.put(`/admin/announcements/${id}`, payload);
    return data;
  }

  async toggleBroadcast(id: string) {
    const { data } = await apiClient.patch(`/admin/announcements/${id}/toggle`);
    return data;
  }

  async deleteBroadcast(id: string) {
    const { data } = await apiClient.delete(`/admin/announcements/${id}`);
    return data;
  }

  async impersonatePharmacy(id: string) {
    const { data } = await apiClient.post(`/admin/pharmacies/${id}/impersonate`);
    return data;
  }

  async restoreSession(token: string) {
    const { data } = await apiClient.post("/admin/restore-session", { token });
    return data;
  }

  // Feedback (Admin)
  async getFeedback(status?: string) {
    const url = status && status !== 'all' ? `/admin/feedback?status=${status}` : `/admin/feedback`;
    const { data } = await apiClient.get(url);
    return data;
  }

  async updateFeedbackStatus(id: string, status: string) {
    const { data } = await apiClient.post(`/admin/feedback/${id}/status`, { status });
    return data;
  }
  // ==========================================
  // SESSIONS & SECURITY
  // ==========================================

  async getSessions() {
    const { data } = await apiClient.get("/sessions");
    return data;
  }

  async revokeSession(id: string) {
    const { data } = await apiClient.delete(`/sessions/${id}`);
    return data;
  }

  async revokeAllSessions() {
    const { data } = await apiClient.post("/sessions/revoke-all");
    return data;
  }

  // ==========================================
  // SYSTEM CONFIGS
  // ==========================================

  async getSystemConfig(key: string) {
    const { data } = await apiClient.get(`/system-configs/${key}`);
    return data.data; // returning the inner 'data' which contains the JSON
  }

  async updateSystemConfig(key: string, value: any) {
    const { data } = await apiClient.put(`/admin/system-configs/${key}`, { value });
    return data;
  }
}

export const webApiClient = new WebApiClient();
export default apiClient;

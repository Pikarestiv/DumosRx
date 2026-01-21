import axios from "axios";

// Ensure you run: npm install axios
// Set NEXT_PUBLIC_API_URL=https://api.rx.dumostech.com/api/v1 in your .env.local

const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL || "https://api.rx.dumostech.com/api/v1",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: false, // Using Bearer token auth, not cookies
});

// Request interceptor to add token if using Bearer tokens (Sanctum Mobile/API mode)
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor for handling 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        // Handle logout or redirect
        // localStorage.removeItem('auth_token');
        // window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

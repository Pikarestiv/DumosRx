import api from "./axios";
import { LoginCredentials, RegisterData, AuthResponse, User } from "./common";

export const authApi = {
  getCsrfCookie: async (): Promise<void> => {
    // We need to hit the root domain, not /api/v1
    // Remove '/api/v1' from the baseURL if present
    const baseURL = api.defaults.baseURL || "";
    const rootURL = baseURL.replace(/\/api\/v1\/?$/, "");

    await api.get("/sanctum/csrf-cookie", { baseURL: rootURL });
  },

  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    await authApi.getCsrfCookie();
    const response = await api.post<AuthResponse>("/login", credentials);
    return response.data;
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/register", data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post("/logout");
  },

  getUser: async (): Promise<User> => {
    const response = await api.get<User>("/user");
    return response.data;
  },
};

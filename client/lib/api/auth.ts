import api from "./axios";
import { LoginCredentials, RegisterData, AuthResponse, User } from "./common";

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
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

// Shared interfaces

export interface User {
  id: string; // UUID
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  phone?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  device_name: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: string;
  phone?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
  role: string;
}

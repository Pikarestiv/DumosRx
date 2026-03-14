"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { query, setCurrentUser as setDbUser } from "@/lib/db/local-database";

interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "pharmacist" | "cashier";
}

interface AuthContextType {
  user: User | null;
  login: (username: string, pin?: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isPharmacist: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check for saved user in session
    const savedUser = localStorage.getItem("dumos_user");
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setDbUser(parsedUser);
    }
  }, []);

  const login = async (username: string, pin?: string) => {
    // For local-first, we just check the users table
    const users = query<any>("SELECT * FROM users WHERE username = ? AND is_active = 1", [username]);
    
    if (users.length > 0) {
      const dbUser = users[0];
      // If PIN is provided, check it
      if (pin && dbUser.pin !== pin) return false;

      const userProfile: User = {
        id: dbUser.id,
        name: dbUser.name,
        username: dbUser.username,
        role: dbUser.role as any,
      };

      setUser(userProfile);
      setDbUser(userProfile);
      localStorage.setItem("dumos_user", JSON.stringify(userProfile));
      return true;
    }
    
    // Fallback: If no users exist, create a default admin
    if (username === "admin") {
      const defaultAdmin: User = {
        id: "default-admin",
        name: "Default Admin",
        username: "admin",
        role: "admin",
      };
      setUser(defaultAdmin);
      setDbUser(defaultAdmin);
      localStorage.setItem("dumos_user", JSON.stringify(defaultAdmin));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    setDbUser(null);
    localStorage.removeItem("dumos_user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isPharmacist: user?.role === "pharmacist" || user?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

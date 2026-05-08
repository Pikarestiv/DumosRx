"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { query, setCurrentUser as setDbUser } from "@/lib/db/local-database";
import { apiClient } from "@/lib/api/client";

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
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; message: string }>;
  linkCloudAccount: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  isCloudLinked: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCloudLinked, setIsCloudLinked] = useState(false);

  useEffect(() => {
    // Check for saved user in session
    const savedUser = localStorage.getItem("dumos_user");
    const token = localStorage.getItem("auth_token");
    
    setIsCloudLinked(!!token);

    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setDbUser(parsedUser);
    }
  }, []);

  const login = async (identifier: string, pin?: string) => {
    // For local-first, we check both username and email
    const cleanIdentifier = identifier.trim();
    const isEmail = cleanIdentifier.includes("@");
    const field = isEmail ? "email" : "username";
    
    const users = await query<any>(`SELECT * FROM users WHERE LOWER(${field}) = LOWER(?) AND is_active = 1`, [cleanIdentifier]);
    
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
    if (cleanIdentifier.toLowerCase() === "admin") {
      const defaultAdmin: User = {
        id: "default-admin",
        name: "Default Admin",
        username: "admin",
        role: "admin",
      };
      
      // Attempt to persist the default admin to DB
      try {
        await query(
          "INSERT OR IGNORE INTO users (id, name, username, pin, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
          [defaultAdmin.id, defaultAdmin.name, defaultAdmin.username, "1234", defaultAdmin.role, 1]
        );
      } catch (e) {
        console.error("Failed to persist default admin", e);
      }

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

  const changePin = async (currentPin: string, newPin: string) => {
    if (!user) return { success: false, message: "Not authenticated" };

    const users = await query<any>("SELECT pin FROM users WHERE id = ?", [user.id]);
    if (users.length === 0) return { success: false, message: "User not found" };

    if (users[0].pin !== currentPin) {
      return { success: false, message: "Current PIN is incorrect" };
    }

    try {
      await query("UPDATE users SET pin = ? WHERE id = ?", [newPin, user.id]);
      return { success: true, message: "PIN updated successfully" };
    } catch (e) {
      console.error("Failed to update PIN", e);
      return { success: false, message: "Database error" };
    }
  };

  const linkCloudAccount = async (email: string, password: string) => {
    try {
      const response = await apiClient.login(email, password);
      
      if (response.token) {
        apiClient.setToken(response.token);
        setIsCloudLinked(true);
        
        // Update local user info if already logged in locally
        if (user) {
          const updatedUser = { ...user, email };
          setUser(updatedUser);
          localStorage.setItem("dumos_user", JSON.stringify(updatedUser));
        }

        return { success: true, message: "Cloud account linked successfully!" };
      }
      return { success: false, message: "Invalid credentials" };
    } catch (e: any) {
      return { success: false, message: e.message || "Failed to connect to cloud" };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isPharmacist: user?.role === "pharmacist",
        changePin,
        linkCloudAccount,
        isCloudLinked,
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

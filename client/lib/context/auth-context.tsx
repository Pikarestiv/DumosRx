"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { setCurrentUser as setDbUser } from "@/lib/db/local-database";
import { apiClient } from "@/lib/api/client";
import { getUserByUsernameOrEmail, createDefaultAdmin, getUserPin, updateUserPin } from "@/lib/db/queries/auth";

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email?: string;
  role: "super_admin" | "store_owner" | "admin" | "manager" | "specialist" | "sales_staff" | "auditor";
  store_id?: string;
}

export interface RecentUser {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  role: string;
  last_login: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, pin?: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  canManageStockBatch: boolean;
  canProcessSales: boolean;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; message: string }>;
  verifyPin: (pin: string) => Promise<boolean>;
  linkCloudAccount: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  isCloudLinked: boolean;
}

export const checkIsAdmin = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z]/g, "");
  return normalizedRole.includes("admin") || normalizedRole.includes("manager") || normalizedRole.includes("storeowner");
};

export const checkCanManageStockBatch = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  return ["admin", "manager", "specialist", "store_owner"].includes(normalizedRole);
};

export const checkCanProcessSales = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  return ["admin", "manager", "specialist", "sales_staff", "store_owner"].includes(normalizedRole);
};

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

    const handleTokenSet = () => setIsCloudLinked(true);
    const handleTokenCleared = () => setIsCloudLinked(false);

    window.addEventListener("auth_token_set", handleTokenSet);
    window.addEventListener("auth_token_cleared", handleTokenCleared);

    return () => {
      window.removeEventListener("auth_token_set", handleTokenSet);
      window.removeEventListener("auth_token_cleared", handleTokenCleared);
    };
  }, []);

  const login = async (identifier: string, pin?: string) => {
    // For local-first, we check both username and email
    const cleanIdentifier = identifier.trim();
    const dbUser = await getUserByUsernameOrEmail(cleanIdentifier);
    
    if (dbUser) {
      // If PIN is provided, check it
      if (pin && dbUser.pin !== pin) return false;

      const userProfile: User = {
        id: dbUser.id,
        first_name: dbUser.first_name,
        last_name: dbUser.last_name,
        username: dbUser.username,
        role: dbUser.role as any,
        store_id: dbUser.store_id,
      };

      setUser(userProfile);
      setDbUser(userProfile);
      localStorage.setItem("dumos_user", JSON.stringify(userProfile));

      // Update recent users list
      const recentUsersStr = localStorage.getItem("dumos_recent_users");
      let recentUsers: RecentUser[] = recentUsersStr ? JSON.parse(recentUsersStr) : [];
      
      const recentUser: RecentUser = {
        id: userProfile.id,
        first_name: userProfile.first_name,
        last_name: userProfile.last_name,
        username: userProfile.username,
        role: userProfile.role,
        last_login: new Date().toISOString(),
      };

      recentUsers = recentUsers.filter((u) => u.id !== recentUser.id);
      recentUsers.unshift(recentUser);
      if (recentUsers.length > 5) recentUsers = recentUsers.slice(0, 5); // Keep last 5

      localStorage.setItem("dumos_recent_users", JSON.stringify(recentUsers));
      
      return true;
    }
    
    // Fallback: If no users exist, create a default admin
    if (cleanIdentifier.toLowerCase() === "admin") {
      const defaultAdmin: User = {
        id: "default-admin",
        first_name: "Default",
        last_name: "Admin",
        username: "admin",
        role: "admin",
      };
      
      // Attempt to persist the default admin to DB
      try {
        await createDefaultAdmin({
          id: defaultAdmin.id,
          first_name: defaultAdmin.first_name,
          last_name: defaultAdmin.last_name,
          username: defaultAdmin.username,
          pin: "1234",
          role: defaultAdmin.role
        });
      } catch (e) {
        console.error("Failed to persist default admin", e);
      }

      setUser(defaultAdmin);
      setDbUser(defaultAdmin);
      localStorage.setItem("dumos_user", JSON.stringify(defaultAdmin));

      // Update recent users list for default admin
      const recentUsersStr = localStorage.getItem("dumos_recent_users");
      let recentUsers: RecentUser[] = recentUsersStr ? JSON.parse(recentUsersStr) : [];
      
      const recentUser: RecentUser = {
        id: defaultAdmin.id,
        first_name: defaultAdmin.first_name,
        last_name: defaultAdmin.last_name,
        username: defaultAdmin.username,
        role: defaultAdmin.role,
        last_login: new Date().toISOString(),
      };

      recentUsers = recentUsers.filter((u) => u.id !== recentUser.id);
      recentUsers.unshift(recentUser);
      if (recentUsers.length > 5) recentUsers = recentUsers.slice(0, 5); // Keep last 5

      localStorage.setItem("dumos_recent_users", JSON.stringify(recentUsers));

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

    const currentStoredPin = await getUserPin(user.id);
    if (!currentStoredPin) return { success: false, message: "User not found" };

    if (currentStoredPin !== currentPin) {
      return { success: false, message: "Current PIN is incorrect" };
    }

    try {
      await updateUserPin(user.id, newPin);
      return { success: true, message: "PIN updated successfully" };
    } catch (e) {
      console.error("Failed to update PIN", e);
      return { success: false, message: "Database error" };
    }
  };

  const verifyPin = async (pin: string) => {
    if (!user) return false;
    const storedPin = await getUserPin(user.id);
    if (storedPin) {
      return storedPin === pin;
    }
    return false;
  };

  const linkCloudAccount = async (email: string, password: string) => {
    try {
      // Prevent linking to a different account if already linked before
      if (user?.email && user.email.toLowerCase() !== email.toLowerCase()) {
        return { 
          success: false, 
          message: `Account mismatch. This device is already linked to ${user.email}. Please use that account.` 
        };
      }

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

  const isAdmin = user ? checkIsAdmin(user.role) : false;
  const canManageStockBatch = user ? checkCanManageStockBatch(user.role) : false;
  const canProcessSales = user ? checkCanProcessSales(user.role) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin,
        canManageStockBatch,
        canProcessSales,
        changePin,
        verifyPin,
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

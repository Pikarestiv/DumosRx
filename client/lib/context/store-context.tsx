"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { update, insert } from "@/lib/db/local-database";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export type StoreType = "pharmacy" | "grocery" | "supermarket" | "general";

interface StoreProfile {
  id: string;
  name: string;
  store_type: StoreType;
  is_initialized: number;
  currency: string;
  vat_percentage: number;
  address?: string;
  phone?: string;
  email?: string;
  updated_at?: string;
}

interface StoreContextType {
  storeProfile: StoreProfile | null;
  loading: boolean;
  storeType: StoreType;
  isInitialized: boolean;
  vatPercentage: number;
  updateStoreProfile: (data: Partial<StoreProfile>) => void;
  t: (key: string) => string;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const terminology: Record<StoreType, Record<string, string>> = {
  pharmacy: {
    product: "Medicine",
    products: "Medicines",
    registration_number: "NAFDAC Number",
    category: "Therapeutic Class",
    stock: "Stock Level",
  },
  grocery: {
    product: "Item",
    products: "Items",
    registration_number: "Registration No.",
    category: "Department",
    stock: "Quantity",
  },
  supermarket: {
    product: "Product",
    products: "Products",
    registration_number: "Reg. Number",
    category: "Aisle/Category",
    stock: "Stock",
  },
  general: {
    product: "Product",
    products: "Products",
    registration_number: "Reg. No",
    category: "Category",
    stock: "Stock",
  },
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data: profiles, loading, refetch } = useLocalData<StoreProfile>(
    "SELECT * FROM store_profile LIMIT 1"
  );

  const storeProfile = profiles[0] || null;
  const storeType = storeProfile?.store_type || "pharmacy";
  const isInitialized = storeProfile?.is_initialized === 1;
  const vatPercentage = storeProfile?.vat_percentage ?? 7.5;

  const updateStoreProfile = async (data: Partial<StoreProfile>) => {
    if (!storeProfile) {
      await insert("store_profile", {
        id: "default",
        name: "My Store",
        store_type: "pharmacy",
        is_initialized: 0,
        vat_percentage: 7.5,
        currency: "NGN",
        ...data,
      });
    } else {
      await update("store_profile", storeProfile.id, data);
    }
    await refetch();
  };

  const t = (key: string): string => {
    return terminology[storeType]?.[key] || terminology["general"][key] || key;
  };

  return (
    <StoreContext.Provider
      value={{
        storeProfile,
        loading,
        storeType,
        isInitialized,
        vatPercentage,
        updateStoreProfile,
        t,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

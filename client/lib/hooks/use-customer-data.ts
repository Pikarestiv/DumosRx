"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { insert, generateId } from "@/lib/db/local-database";
import { getCustomers, getCustomerRetentionMetrics } from "@/lib/db/queries/customers";
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  joinDate: string;
  tier: string;
  points: number;
  totalSpent: number;
  lastVisit: string;
  birthday: string;
  status: string;
  outstanding_balance: number;
}

const getTier = (spent: number) => {
  if (spent >= 500000) return "Platinum";
  if (spent >= 300000) return "Gold";
  if (spent >= 100000) return "Silver";
  return "Bronze";
};

const transformCustomer = (dbData: any): Customer => {
  const totalSpent = dbData.total_spent || 0;
  
  return {
    id: dbData.id,
    name: `${dbData.first_name} ${dbData.last_name || ""}`.trim(),
    email: dbData.email || "",
    phone: dbData.phone || "",
    address: dbData.address || "",
    joinDate: new Date(dbData.created_at || new Date()).toISOString().split("T")[0],
    tier: getTier(totalSpent),
    points: dbData.loyalty_points || 0,
    totalSpent: totalSpent,
    lastVisit: dbData.last_visit ? new Date(dbData.last_visit).toISOString().split("T")[0] : "-",
    birthday: dbData.date_of_birth || "",
    status: dbData.is_active ? "active" : "inactive",
    outstanding_balance: dbData.outstanding_balance || 0,
  };
};

export interface CustomerMetrics {
  totalCustomers: number;
  loyaltyMembers: number;
  totalPoints: number;
  avgPoints: number;
  retentionRate: number;
  avgVisits: number;
  avgTransaction: number;
  segmentation: { name: string; count: number; percentage: number }[];
}

export function useCustomerData() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [metrics, setMetrics] = useState<CustomerMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await getCustomers();
      const transformed = data.map(transformCustomer);
      setCustomers(transformed);
      
      const retMetrics = await getCustomerRetentionMetrics();
      
      const totalCustomers = transformed.length;
      const loyaltyMembers = transformed.filter(c => c.points > 0).length;
      const totalPoints = transformed.reduce((acc, c) => acc + (c.points || 0), 0);
      const avgPoints = totalCustomers > 0 ? Math.round(totalPoints / totalCustomers) : 0;
      
      const tiers = ["Platinum", "Gold", "Silver", "Bronze"];
      const segmentation = tiers.map(t => {
        const count = transformed.filter(c => c.tier === t).length;
        return {
          name: t,
          count,
          percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0
        };
      });
      
      setMetrics({
        totalCustomers,
        loyaltyMembers,
        totalPoints,
        avgPoints,
        retentionRate: retMetrics.retentionRate || 0,
        avgVisits: retMetrics.avgVisits || 0,
        avgTransaction: retMetrics.avgTransactionValue || 0,
        segmentation
      });
      
    } catch (error) {
      console.error("Failed to fetch customers", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const addCustomer = async (payload: any) => {
    try {
      const now = new Date().toISOString();
      const customerId = generateId();
      
      const customerData = {
        id: customerId,
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        date_of_birth: payload.date_of_birth,
        gender: payload.gender,
        allergies: payload.allergies,
        medical_conditions: payload.medical_conditions,
        is_active: 1,
        created_at: now,
        updated_at: now,
      };

      await insert("customers", customerData);
      
      const newCustomer = transformCustomer(customerData);
      setCustomers((prev) => [newCustomer, ...prev]);
      toast.success("Customer added successfully");
      return newCustomer;
    } catch (error: any) {
      console.error("Failed to create customer", error);
      toast.error("Failed to create customer locally");
      throw error;
    }
  };

  return {
    customers,
    metrics,
    loading,
    fetchCustomers,
    addCustomer,
  };
}

"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

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
}

const transformCustomer = (apiData: any): Customer => ({
  id: apiData.id,
  name: `${apiData.first_name} ${apiData.last_name}`,
  email: apiData.email || "",
  phone: apiData.phone || "",
  address: apiData.address || "",
  joinDate: new Date(apiData.created_at || new Date()).toISOString().split("T")[0],
  tier: "Bronze",
  points: apiData.loyalty_points || 0,
  totalSpent: 0,
  lastVisit: "-",
  birthday: apiData.date_of_birth || "",
  status: "active",
});

export function useCustomerData() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getCustomers(1, 100);
      const data = response.data || [];
      const transformed = data.map(transformCustomer);
      setCustomers(transformed);
    } catch (error) {
      console.error("Failed to fetch customers", error);
    } finally {
      setLoading(false);
    }
  };

  const addCustomer = async (payload: any) => {
    try {
      const response = await apiClient.createCustomer(payload);
      const newCustomer = transformCustomer(response);
      setCustomers((prev) => [newCustomer, ...prev]);
      return newCustomer;
    } catch (error: any) {
      console.error("Failed to create customer", error);
      const message = error.message || "Failed to create customer. Please check fields.";
      toast.error(message);
      throw error;
    }
  };

  return {
    customers,
    loading,
    fetchCustomers,
    addCustomer,
  };
}

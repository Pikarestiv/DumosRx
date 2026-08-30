"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCustomers, getCustomerRetentionMetrics, getCustomerTransactions } from "@/lib/db/queries/customers";
import { getLoyaltyTiers, LoyaltyTierRow } from "@/lib/db/queries/loyalty";
import {
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useRecordCustomerPaymentMutation,
} from "@/lib/hooks/use-customer-mutations";
import { queryKeys } from "@/lib/query-keys";
import type { CustomerDbRow, CustomerFormPayload, CustomerTransactionRow } from "@/lib/types/customer";
export interface Customer {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
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

const FALLBACK_TIERS: Pick<LoyaltyTierRow, "name" | "min_spend">[] = [
  { name: "Platinum", min_spend: 500000 },
  { name: "Gold", min_spend: 300000 },
  { name: "Silver", min_spend: 100000 },
  { name: "Bronze", min_spend: 0 },
];

const getTier = (spent: number, tiers: Pick<LoyaltyTierRow, "name" | "min_spend">[] = FALLBACK_TIERS) => {
  const sorted = [...tiers].sort((a, b) => b.min_spend - a.min_spend);
  const match = sorted.find((t) => spent >= t.min_spend);
  return match?.name || sorted[sorted.length - 1]?.name || "Bronze";
};

const transformCustomer = (
  dbData: CustomerDbRow,
  tiers?: Pick<LoyaltyTierRow, "name" | "min_spend">[],
): Customer => {
  const totalSpent = dbData.total_spent || 0;

  return {
    id: dbData.id,
    name: `${dbData.first_name} ${dbData.last_name || ""}`.trim(),
    firstName: dbData.first_name || "",
    lastName: dbData.last_name || "",
    email: dbData.email || "",
    phone: dbData.phone || "",
    address: dbData.address || "",
    joinDate: new Date(dbData.created_at || new Date()).toISOString().split("T")[0],
    tier: getTier(totalSpent, tiers),
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

async function fetchCustomerData() {
  const dbTiers = await getLoyaltyTiers();
  const tiers = dbTiers.length > 0 ? dbTiers : undefined;

  const data = await getCustomers();
  const transformed = data.map((c) => transformCustomer(c, tiers));

  const retMetrics = await getCustomerRetentionMetrics();

  const totalCustomers = transformed.length;
  const loyaltyMembers = transformed.filter((c) => c.points > 0).length;
  const totalPoints = transformed.reduce((acc, c) => acc + (c.points || 0), 0);
  const avgPoints = totalCustomers > 0 ? Math.round(totalPoints / totalCustomers) : 0;

  const tierNames = tiers?.length
    ? [...tiers].sort((a, b) => b.min_spend - a.min_spend).map((t) => t.name)
    : FALLBACK_TIERS.map((t) => t.name);
  const segmentation = tierNames.map((t) => {
    const count = transformed.filter((c) => c.tier === t).length;
    return {
      name: t,
      count,
      percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0,
    };
  });

  const metrics: CustomerMetrics = {
    totalCustomers,
    loyaltyMembers,
    totalPoints,
    avgPoints,
    retentionRate: retMetrics.retentionRate || 0,
    avgVisits: retMetrics.avgVisits || 0,
    avgTransaction: retMetrics.avgTransactionValue || 0,
    segmentation,
  };

  return { customers: transformed, metrics, tiers };
}

export function useCustomerData() {
  const {
    data,
    isLoading: loading,
    refetch,
  } = useQuery({
    ...queryKeys.customers.all(),
    queryFn: fetchCustomerData,
  });

  const fetchCustomers = async () => {
    await refetch();
  };

  const customers = data?.customers ?? [];
  const metrics = data?.metrics ?? null;

  const createCustomerMutation = useCreateCustomerMutation();
  const addCustomer = async (payload: CustomerFormPayload) => {
    try {
      const customerData = await createCustomerMutation.mutateAsync(payload);
      const newCustomer = transformCustomer(customerData, data?.tiers);
      toast.success("Customer added successfully");
      return newCustomer;
    } catch (error) {
      console.error("Failed to create customer", error);
      toast.error("Failed to create customer locally");
      throw error;
    }
  };

  const updateCustomerMutation = useUpdateCustomerMutation();
  const updateCustomer = async (id: string, payload: CustomerFormPayload): Promise<Customer | null> => {
    try {
      const existing = customers.find((c) => c.id === id);
      if (!existing) return null;

      const customerData = await updateCustomerMutation.mutateAsync({ id, payload });

      const updatedCustomer = transformCustomer({
        ...customerData,
        id,
        total_spent: existing.totalSpent,
        loyalty_points: existing.points,
        last_visit: existing.lastVisit === "-" ? null : existing.lastVisit,
        created_at: existing.joinDate,
        is_active: existing.status === "active",
        outstanding_balance: existing.outstanding_balance,
      }, data?.tiers);

      toast.success("Customer updated successfully");
      return updatedCustomer;
    } catch (error) {
      console.error("Failed to update customer", error);
      toast.error("Failed to update customer");
      throw error;
    }
  };

  const recordPaymentMutation = useRecordCustomerPaymentMutation();
  const recordPayment = async (
    id: string,
    amount: number,
    paymentMethod: string,
    notes?: string,
  ): Promise<Customer | null> => {
    try {
      const existing = customers.find((c) => c.id === id);
      if (!existing) return null;

      const newBalance = await recordPaymentMutation.mutateAsync({
        customerId: id,
        amount,
        paymentMethod,
        notes,
      });

      const updatedCustomer: Customer = { ...existing, outstanding_balance: newBalance };
      toast.success("Payment recorded successfully");
      return updatedCustomer;
    } catch (error) {
      console.error("Failed to record payment", error);
      toast.error("Failed to record payment");
      throw error;
    }
  };

  return {
    customers,
    metrics,
    loading,
    fetchCustomers,
    addCustomer,
    updateCustomer,
    recordPayment,
  };
}

export interface CustomerTransaction {
  id: string;
  transactionNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  pointsEarned: number;
  date: string;
  itemCount: number;
  itemNames: string[];
}

const transformTransaction = (row: CustomerTransactionRow): CustomerTransaction => ({
  id: row.id,
  transactionNumber: row.transaction_number,
  customerId: row.customer_id,
  customerName: `${row.first_name} ${row.last_name || ""}`.trim(),
  amount: row.total_amount || 0,
  pointsEarned: row.points_earned || 0,
  date: row.transaction_date,
  itemCount: row.item_count || 0,
  itemNames: row.item_names ? String(row.item_names).split("||").filter(Boolean) : [],
});

const TRANSACTIONS_RECENT_WINDOW_DAYS = 30;

export function useCustomerTransactions() {
  const [hasFullHistory, setHasFullHistory] = useState(false);
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});

  const {
    data: transactions = [],
    isLoading: loading,
    refetch,
  } = useQuery({
    ...queryKeys.customers.transactions(hasFullHistory, dateRange),
    queryFn: async () => {
      const data = dateRange.from
        ? await getCustomerTransactions(dateRange)
        : hasFullHistory
          ? await getCustomerTransactions()
          : await getCustomerTransactions({ sinceDays: TRANSACTIONS_RECENT_WINDOW_DAYS });
      return data.map(transformTransaction);
    },
  });

  const loadFullHistory = async () => {
    if (hasFullHistory) return;
    setHasFullHistory(true);
  };

  return {
    transactions,
    loading,
    hasFullHistory,
    loadFullHistory,
    dateRange,
    setDateRange,
    refetch: async () => {
      await refetch();
    },
  };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { Coupon, PaginatedResponse } from "@/lib/types/admin";
import type {
  ReferralSummary,
  ReferralProgramSettings,
  ReferralRelationship,
  CreditTransaction,
} from "@/components/admin/marketing/types";

// Referrals Manager Hooks
export const useReferralsSummary = () => {
  return useQuery({
    queryKey: useScopedKey(["referrals-summary"]),
    queryFn: () => webApiClient.request<ReferralSummary>("admin/referrals/summary"),
  });
};

export const useReferralsSettings = () => {
  return useQuery({
    queryKey: useScopedKey(["referrals-settings"]),
    queryFn: () => webApiClient.request<ReferralProgramSettings>("admin/referrals/settings"),
  });
};

export const useReferralsRelationships = () => {
  return useQuery({
    queryKey: useScopedKey(["referrals-relationships"]),
    queryFn: () => webApiClient.request<PaginatedResponse<ReferralRelationship>>("admin/referrals"),
  });
};

export const useReferralsTransactions = () => {
  return useQuery({
    queryKey: useScopedKey(["referrals-transactions"]),
    queryFn: () => webApiClient.request<PaginatedResponse<CreditTransaction>>("admin/referrals/transactions"),
  });
};

export const useUpdateReferralsSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: ReferralProgramSettings) =>
      webApiClient.request<unknown>("admin/referrals/settings", {
        method: "PUT",
        body: settings,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals-settings"] });
    },
  });
};

export const useAdjustReferralsCreditsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      user_id: string;
      amount: number;
      type: string;
      description: string;
    }) =>
      webApiClient.request<unknown>("admin/referrals/adjust-credits", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals-summary"] });
      queryClient.invalidateQueries({ queryKey: ["referrals-relationships"] });
      queryClient.invalidateQueries({ queryKey: ["referrals-transactions"] });
    },
  });
};

// Coupons Manager Hooks
export const useAdminCoupons = () => {
  return useQuery({
    queryKey: useScopedKey(["admin-coupons"]),
    queryFn: () => webApiClient.request<Coupon[] | { data: Coupon[] }>("admin/coupons"),
  });
};

export const useGenerateCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      webApiClient.request<unknown>("admin/coupons", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

export const useUpdateCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      webApiClient.request<unknown>(`admin/coupons/${id}`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

export const useToggleCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/coupons/${id}/toggle`, {
        method: "PUT",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

export const useDeleteCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/coupons/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

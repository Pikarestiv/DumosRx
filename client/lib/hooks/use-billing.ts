import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";
import type { PaymentPayload } from "@/lib/types/subscription-plans";

export function useSubscriptionStatus() {
  return useQuery({
    ...queryKeys.billing.status(),
    queryFn: () => apiClient.getSubscriptionStatus(),
  });
}

export function useReferralStats() {
  return useQuery({
    ...queryKeys.billing.referrals(),
    queryFn: () => apiClient.getReferralStats(),
  });
}

export function useBillingHistory() {
  return useQuery({
    ...queryKeys.billing.history(),
    queryFn: () => apiClient.getBillingHistory(),
  });
}

export function usePayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PaymentPayload) => apiClient.pay(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.billing.status());
      queryClient.invalidateQueries(queryKeys.billing.history());
    },
  });
}

export function useValidateCouponMutation() {
  return useMutation({
    mutationFn: (payload: { code: string; plan_name?: string; interval?: string }) =>
      apiClient.validateCoupon(payload),
  });
}

export function useVerifyPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => apiClient.verifyPayment(reference),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.billing.status());
    },
  });
}

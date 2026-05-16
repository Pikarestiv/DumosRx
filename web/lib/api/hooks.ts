import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";

export const useStores = () => {
  return useQuery({
    queryKey: ["stores"],
    queryFn: () => webApiClient.getDashboardSummary().then(data => data.stores),
  });
};

export const useDashboardSummary = () => {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => webApiClient.getDashboardSummary(),
  });
};

export const useStaff = (storeId?: string) => {
  return useQuery({
    queryKey: ["staff", storeId],
    queryFn: () => webApiClient.getStaff(storeId),
  });
};

export const useNotifications = () => {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => webApiClient.getNotifications(),
  });
};

// Mutations
export const useCreateStaffMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => webApiClient.createStaff(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useUpdateStaffMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => webApiClient.updateStaff(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });
};

export const useDeleteStaffMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.deleteStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });
};

export const useCreateStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => webApiClient.createStore(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useUpdateStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => webApiClient.updateStore(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useDeleteStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.deleteStore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useSubscriptionStatus = () => {
  return useQuery({
    queryKey: ["subscription-status"],
    queryFn: () => webApiClient.getSubscriptionStatus(),
  });
};

export const useInitiatePaymentMutation = () => {
  return useMutation({
    mutationFn: (payload: { amount: number; plan_name: string }) => webApiClient.initiatePayment(payload),
  });
};

export const useVerifyPaymentMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => webApiClient.verifyPayment(reference),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
      queryClient.invalidateQueries({ queryKey: ["billing-history"] });
    },
  });
};

export const useBillingHistory = () => {
  return useQuery({
    queryKey: ["billing-history"],
    queryFn: () => webApiClient.getBillingHistory(),
  });
};

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

interface ResetDataParams {
  type: string;
  password: string;
}

export function useResetDataMutation() {
  return useMutation({
    mutationFn: ({ type, password }: ResetDataParams) => apiClient.resetData(type, password),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    },
  });
}

interface RequestAccountDeletionParams {
  reason: string;
  password: string;
}

export function useRequestAccountDeletionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, password }: RequestAccountDeletionParams) =>
      apiClient.requestAccountDeletion({ reason, password }),
    onSuccess: () => {
      toast.success("Account deletion requested successfully.");
      queryClient.invalidateQueries(queryKeys.account.currentUser());
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to request account deletion");
    },
  });
}

export function useCancelAccountDeletionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.cancelAccountDeletion(),
    onSuccess: () => {
      toast.success("Account deletion request cancelled successfully.");
      queryClient.invalidateQueries(queryKeys.account.currentUser());
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to cancel deletion request");
    },
  });
}

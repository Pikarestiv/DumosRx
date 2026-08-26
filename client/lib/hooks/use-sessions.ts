import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useSessions() {
  return useQuery({
    ...queryKeys.account.sessions(),
    queryFn: () => apiClient.getSessions(),
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.account.sessions());
    },
  });
}

export function useRevokeAllSessionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.revokeAllSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.account.sessions());
    },
  });
}

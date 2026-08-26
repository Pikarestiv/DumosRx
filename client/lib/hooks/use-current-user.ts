import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useCurrentUser() {
  return useQuery({
    ...queryKeys.account.currentUser(),
    queryFn: () => apiClient.getProfile(),
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { first_name: string; last_name: string; phone?: string | null }) =>
      apiClient.updateProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.account.currentUser());
    },
  });
}

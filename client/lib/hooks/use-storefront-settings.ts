import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";
import type { StorefrontSettingsUpdate } from "@/lib/types/storefront-settings";

export function useStorefrontSettings(enabled: boolean) {
  return useQuery({
    ...queryKeys.storefrontSettings.show(),
    queryFn: () => apiClient.getStorefrontSettings(),
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useUpdateStorefrontSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StorefrontSettingsUpdate) =>
      apiClient.updateStorefrontSettings(payload),
    onSuccess: (settings) => {
      queryClient.setQueryData(
        queryKeys.storefrontSettings.show().queryKey,
        settings,
      );
    },
  });
}

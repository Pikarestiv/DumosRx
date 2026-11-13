import { useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";

export const useSetStoreStorefrontThemeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, theme }: { id: string; theme: string }) =>
      webApiClient.request<{ message: string; theme: string }>(`admin/stores/${id}/storefront/theme`, {
        method: "PUT",
        body: { theme },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-store-detail"] });
    },
  });
};

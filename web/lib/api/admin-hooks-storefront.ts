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

export interface StorefrontSettingsInput {
  accent?: string | null;
  tagline?: string | null;
  whatsapp?: string | null;
  pickup_minutes?: number | null;
  opening_hours?: Record<string, { open: string; close: string } | null> | null;
  locale?: string | null;
  enabled_locales?: string[] | null;
}

export const useUpdateStoreStorefrontSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: StorefrontSettingsInput }) =>
      webApiClient.request<{ message: string }>(`admin/stores/${id}/storefront/settings`, {
        method: "PUT",
        body: settings,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-store-detail"] });
    },
  });
};

export const useRebuildStorefrontsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webApiClient.request<{ message: string }>("admin/storefront/rebuild", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-store-detail"] });
    },
  });
};

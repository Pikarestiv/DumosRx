import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";

export interface AdminRole {
  id: number;
  name: string;
  slug: string;
  is_system: boolean;
  permissions: string[];
  user_count: number;
}

export const useAdminRoles = () => {
  return useQuery({
    queryKey: useScopedKey(["admin-roles"]),
    queryFn: () => webApiClient.request<{ roles: AdminRole[] }>("admin/roles"),
  });
};

export const useCreateRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, permissions }: { name: string; permissions: string[] }) =>
      webApiClient.request<unknown>("admin/roles", { method: "POST", body: { name, permissions } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
};

export const useUpdateRolePermissionsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, permissions }: { slug: string; permissions: string[] }) =>
      webApiClient.request<unknown>(`admin/roles/${slug}/permissions`, {
        method: "PUT",
        body: { permissions },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
};

export const useDeleteRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => webApiClient.request<unknown>(`admin/roles/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
};

export const useUpdateUserPermissionOverridesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overrides }: { id: string; overrides: Record<string, boolean | null> }) =>
      webApiClient.request<unknown>(`admin/users/${id}/permission-overrides`, {
        method: "PUT",
        body: { overrides },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
};

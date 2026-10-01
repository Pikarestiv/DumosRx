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

/** GET /admin/roles is `role:super_admin`, so a delegated admin must pass
 * `enabled: false` rather than firing a request that can only 403. */
export const useAdminRoles = (enabled = true) => {
  return useQuery({
    queryKey: useScopedKey(["admin-roles"]),
    queryFn: () => webApiClient.request<{ roles: AdminRole[] }>("admin/roles"),
    enabled,
  });
};

/**
 * One user's effective_permissions, fetched on demand for the per-admin
 * permission-override form — deliberately NOT part of the paginated
 * GET /admin/users list, which would re-run this N+1-prone accessor per
 * row of every page (see laravel-server's b7a39eea commit).
 */
export const useAdminUserEffectivePermissions = (userId: string | undefined, enabled = true) => {
  return useQuery({
    queryKey: useScopedKey(["admin-user-effective-permissions", userId]),
    queryFn: () =>
      webApiClient.request<{ effective_permissions: string[] }>(`admin/users/${userId}/permissions`),
    enabled: enabled && !!userId,
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

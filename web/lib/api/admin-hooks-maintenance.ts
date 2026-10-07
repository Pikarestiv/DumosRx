import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { AdminMigrationStatus } from "@/lib/types/admin";

export const MIGRATION_STATUS_KEY = "admin-migration-status";

export const useAdminMigrationStatus = (enabled = true) =>
  useQuery({
    queryKey: useScopedKey([MIGRATION_STATUS_KEY]),
    queryFn: () => webApiClient.request<AdminMigrationStatus>("admin/maintenance/migrations"),
    enabled,
    staleTime: 60 * 1000,
  });

interface MaintenanceRunResult {
  ok: boolean;
  applied?: string[];
  output: string;
  status_after?: AdminMigrationStatus;
}

/**
 * onSettled, not onSuccess: a failed or timed-out run is exactly when the
 * pending list has to be re-read, because the request's outcome is not
 * evidence of what the database now contains.
 */
export const useRunMigrationsMutation = () => {
  const queryClient = useQueryClient();
  const queryKey = useScopedKey([MIGRATION_STATUS_KEY]);

  return useMutation({
    mutationFn: () =>
      webApiClient.request<MaintenanceRunResult>("admin/maintenance/migrations/run", {
        method: "POST",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
};

export const useSyncRolesMutation = () =>
  useMutation({
    mutationFn: () =>
      webApiClient.request<MaintenanceRunResult>("admin/maintenance/roles/sync", {
        method: "POST",
      }),
  });

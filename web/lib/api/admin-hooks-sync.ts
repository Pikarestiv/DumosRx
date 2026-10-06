import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { AdminSyncHealth, AdminStoreSyncHealth } from "@/lib/types/admin";

/** Raw refusal reasons are the sync engine's own vocabulary. The gloss is for
 * the operator; the raw string stays on screen so a support conversation can
 * quote it. See web/AGENTS.md. */
const REASON_LABELS: Record<string, string> = {
  permission_denied: "Refused: the pushing session had no access to that store",
  forbidden: "Refused: not permitted for this session, will retry",
  unsupported_operation: "Refused: the server does not sync this table",
  quantity_received_exceeds_ordered: "Rejected: received more stock than the order allows",
  version_conflict: "Conflict: another device changed this record first",
  stale_timestamp: "Conflict: an older edit arrived after a newer one",
  server_error: "Server error while applying this change — see the server log",
};

export function syncReasonLabel(reason: string): string | null {
  return Object.hasOwn(REASON_LABELS, reason) ? REASON_LABELS[reason] : null;
}

export const useAdminSyncHealth = () =>
  useQuery({
    queryKey: useScopedKey(["admin-sync-health"]),
    queryFn: () => webApiClient.request<AdminSyncHealth>("admin/sync/health"),
    staleTime: 60 * 1000,
  });

export const useAdminStoreSyncHealth = (storeId?: string, page = 1) =>
  useQuery({
    queryKey: useScopedKey(["admin-store-sync-health", storeId, page]),
    queryFn: () =>
      webApiClient.request<AdminStoreSyncHealth>(
        `admin/sync/stores/${storeId}?page=${page}`,
      ),
    enabled: Boolean(storeId),
    staleTime: 60 * 1000,
  });

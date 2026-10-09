"use client";

import { useRouter } from "next/navigation";
import { StoreRowActions } from "@/components/admin/stores/store-row-actions";
import { StoreDialogHost } from "@/components/admin/stores/store-dialog-host";
import { useStoreActions } from "@/hooks/use-store-actions";
import {
  useAdminAuthStore,
  checkIsSuperAdmin,
  checkHasPermission,
} from "@/lib/store/use-admin-auth-store";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";
import type { AdminStoreSummary } from "@/lib/types/admin";

function toSummary(store: AdminStoreDetail): AdminStoreSummary {
  return {
    id: store.id,
    name: store.name,
    owner: store.owner?.name ?? "—",
    email: store.owner?.email ?? undefined,
    plan: store.subscription?.plan ?? "—",
    status: store.status,
    date: store.created_at ?? "",
    revenue: store.revenue,
    is_demo: store.is_demo,
    device_id: store.sync.device_id,
    is_archived: store.is_archived,
    archived_at: store.archived_at,
    account_manager: store.account_manager
      ? { id: store.account_manager.id, name: store.account_manager.name }
      : null,
    account_manager_is_explicit: store.account_manager_is_explicit,
  };
}

export function StoreDetailActions({
  store,
  onChanged,
}: {
  store: AdminStoreDetail;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { user } = useAdminAuthStore();
  const actions = useStoreActions(onChanged);

  return (
    <>
      <StoreRowActions
        store={toSummary(store)}
        trigger="labelled"
        isSuperAdmin={checkIsSuperAdmin(user?.role)}
        canGrantTrials={checkHasPermission(user, "grant_trials")}
        canImpersonate={checkHasPermission(user, "impersonate_store")}
        canManageAccountStatus={checkHasPermission(user, "manage_account_status")}
        pendingStoreId={actions.pendingStoreId}
        router={router}
        {...actions.handlers}
      />
      <StoreDialogHost {...actions.dialogHost} />
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Store as StoreIcon, ChevronDown, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { APP_NAME } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { FleetFormDialog } from "@/components/settings/store/fleet-form-dialog";
import type { StoreProfile } from "@/lib/context/store-context";

interface HeaderStoreSwitcherProps {
  storeProfile: StoreProfile | null;
  availableStores: StoreProfile[];
  activeStoreId: string | null;
  onSwitchStore: (storeId: string) => void;
  /** Only admins/store owners can create a store, so only they get the
   * dropdown at all — a cashier's plain label is never worth turning into a
   * menu that has nothing useful in it besides an action they can't take. */
  isAdmin: boolean;
}

/** The store name in the header's top-left corner: a plain label for
 * non-admin accounts (staff/cashiers - they can never create a store, plan
 * or no plan), or a switcher dropdown for every admin/owner account, even
 * one that only has a single store today. The dropdown always offers
 * "Create new store" so multi-store is discoverable from here rather than
 * only from Settings > Fleet; the action itself (not the dropdown's
 * visibility) is what's plan-gated, via useFeatureGate's canManageMultiStore. */
export function HeaderStoreSwitcher({
  storeProfile,
  availableStores,
  activeStoreId,
  onSwitchStore,
  isAdmin,
}: HeaderStoreSwitcherProps) {
  const queryClient = useQueryClient();
  const { canManageMultiStore, getUpgradeMessage } = useFeatureGate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // availableStores is empty for plenty of legitimate single-store admins
  // (see store-context.tsx's `allStores` query - it only runs at all for a
  // store_id-less "owner" identity), so it can't be relied on alone to know
  // what to list. Falling back to the currently-active store keeps a
  // single-store admin's dropdown non-empty (their own store, checked) which
  // is what "Create new store" needs a checked list to make sense next to.
  const storesToList = useMemo(
    () => (availableStores.length > 0 ? availableStores : storeProfile ? [storeProfile] : []),
    [availableStores, storeProfile],
  );

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-1 font-medium text-foreground">
        <StoreIcon className="h-3 w-3" />
        <span className="truncate max-w-[40vw] sm:max-w-[200px]">
          {storeProfile?.name || APP_NAME}
        </span>
      </div>
    );
  }

  const handleCreateStore = () => {
    if (!canManageMultiStore) {
      toast.error(
        getUpgradeMessage(
          "multi_store",
          "Running multiple stores is available on higher plans.",
        ),
      );
      return;
    }
    setIsCreateOpen(true);
  };

  // Prefix-matches every cached variant of these queries regardless of
  // which store/user args they were fetched with (a plain string literal
  // would do the same, but derives the prefix from the factory - via a
  // throwaway call - instead of duplicating it, so a rename in
  // query-keys.ts can't silently desync from this call site).
  const invalidateStoreCaches = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.stores.all().queryKey.slice(0, 1) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stores.profile().queryKey.slice(0, 1) });
  };

  // Fleet writes (FleetFormDialog -> useSaveFleetStoreMutation) go straight
  // to the cloud API and never touch local SQLite, so this dropdown's own
  // `availableStores` (backed by a local-DB query) won't show the new store
  // until a sync pull lands - invalidating alone just re-runs the same
  // stale local read. Trigger that pull ourselves (same pattern as
  // switchStore in store-context.tsx) and invalidate once it's actually
  // landed, so the new store shows up without needing a manual refresh.
  const handleCreateSuccess = () => {
    invalidateStoreCaches();

    if (typeof window !== "undefined" && navigator.onLine) {
      void import("@/lib/db/sync-engine").then(({ sync }) =>
        sync().then((result) => {
          if (result.success) {
            invalidateStoreCaches();
          }
        }),
      );
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors outline-none">
            <StoreIcon className="h-3 w-3" />
            <span className="truncate max-w-[40vw] sm:max-w-[200px]">
              {storeProfile?.name || APP_NAME}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {storesToList.map((store) => (
            <DropdownMenuItem
              key={store.id}
              onClick={() => onSwitchStore(store.id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{store.name}</span>
              {(activeStoreId ?? storeProfile?.id) === store.id && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleCreateStore}
            className="group flex items-center gap-2 text-primary"
          >
            {/* DropdownMenuItem's base styles force any icon without its own
                text-* class to text-muted-foreground permanently (see
                dropdown-menu.tsx's `[&_svg:not([class*='text-'])]` rule), so
                without an explicit color here the icon would stay muted while
                the label text turns accent-foreground on hover/focus. Giving
                it group-focus:text-accent-foreground keeps both in sync. */}
            <Plus className="h-3.5 w-3.5 text-primary group-focus:text-accent-foreground" />
            <span>Create new store</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FleetFormDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        storeToEdit={null}
        activeStoreId={activeStoreId}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}

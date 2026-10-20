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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StoreProfile } from "@/lib/context/store-context";

interface HeaderStoreSwitcherProps {
  storeProfile: StoreProfile | null;
  availableStores: StoreProfile[];
  activeStoreId: string | null;
  onSwitchStore: (storeId: string) => void;
  // Only admins/store owners can create a store, so only they get the dropdown at all — a cashier's plain label is never wor…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-dashboard-header-store-switcher-tsx-L26
  isAdmin: boolean;
}

// The store name in the header's top-left corner:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-dashboard-header-store-switcher-tsx-L32
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

  // availableStores is empty for plenty of legitimate single-store admins (see store-context.tsx's `allStores` query - it on…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-header-store-switcher-tsx-L50
  const storesToList = useMemo(
    () => (availableStores.length > 0 ? availableStores : storeProfile ? [storeProfile] : []),
    [availableStores, storeProfile],
  );

  if (!isAdmin) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 font-medium text-foreground">
            <StoreIcon className="h-3 w-3" />
            <span className="truncate max-w-[40vw] sm:max-w-[200px]">
              {storeProfile?.name || APP_NAME}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{storeProfile?.name || APP_NAME}</TooltipContent>
      </Tooltip>
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

  // Prefix-matches every cached variant of these queries regardless of which store/user args they were fetched with (a plain…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-header-store-switcher-tsx-L90
  const invalidateStoreCaches = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.stores.all().queryKey.slice(0, 1) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stores.profile().queryKey.slice(0, 1) });
  };

  // Fleet writes (FleetFormDialog -> useSaveFleetStoreMutation) go straight to the cloud API and never touch local SQLite, s…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-header-store-switcher-tsx-L100
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
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors outline-none">
                <StoreIcon className="h-3 w-3" />
                <span className="truncate max-w-[40vw] sm:max-w-[200px]">
                  {storeProfile?.name || APP_NAME}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{storeProfile?.name || APP_NAME}</TooltipContent>
        </Tooltip>
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
            {/* DropdownMenuItem's base styles force any icon without its own text-* class to text-muted-foreground permanently (see dro… — docs/CLIENT_COMMENTS.md#block-components-dashboard-header-store-switcher-tsx-L156 */}
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

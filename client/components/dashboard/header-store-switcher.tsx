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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { FleetFormDialog } from "@/components/settings/store/fleet-form-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { hasActiveStockAuditCount } from "@/lib/hooks/use-stock-audit-draft";
import { hasActiveStockAdjustmentDraft } from "@/lib/hooks/use-stock-adjustment-draft";
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
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { canManageMultiStore, getUpgradeMessage } = useFeatureGate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);
  const [showAuditReminder, setShowAuditReminder] = useState(false);

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

  const currentStoreId = activeStoreId ?? storeProfile?.id;
  const hasActiveAudit = hasActiveStockAuditCount(currentStoreId);
  const hasActiveAdjustment = hasActiveStockAdjustmentDraft(currentStoreId);

  const reminderTitle =
    hasActiveAudit && hasActiveAdjustment
      ? "Work in Progress"
      : hasActiveAdjustment
        ? "Stock Adjustment in Progress"
        : "Stock Audit in Progress";

  const reminderDescription =
    hasActiveAudit && hasActiveAdjustment
      ? `You have an unfinished stock audit and adjustment in progress for ${storeProfile?.name || "this store"}. Your in-progress work stays saved locally on this device and will be waiting when you return.`
      : hasActiveAdjustment
        ? `You have an unfinished stock adjustment in progress for ${storeProfile?.name || "this store"}. Your in-progress items stay saved locally on this device and will be waiting when you return.`
        : `You have an active stock count in progress for ${storeProfile?.name || "this store"}. Your counted rows stay saved locally on this device and will be waiting when you return.`;

  const handleStoreClick = (targetStoreId: string) => {
    if (targetStoreId === currentStoreId) return;

    if (hasActiveAudit || hasActiveAdjustment) {
      setPendingStoreId(targetStoreId);
      setShowAuditReminder(true);
      return;
    }

    onSwitchStore(targetStoreId);
  };

  const handleConfirmSwitch = () => {
    if (pendingStoreId) {
      onSwitchStore(pendingStoreId);
      setPendingStoreId(null);
    }
    setShowAuditReminder(false);
  };

  const triggerButton = (
    <button
      type="button"
      onClick={!isDesktop ? () => setMobileSheetOpen(true) : undefined}
      className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors outline-none pointer-coarse:-my-3 pointer-coarse:py-3"
    >
      <StoreIcon className="h-3 w-3" />
      <span className="truncate max-w-[40vw] sm:max-w-[200px]">
        {storeProfile?.name || APP_NAME}
      </span>
      <ChevronDown className="h-3 w-3 shrink-0" />
    </button>
  );

  return (
    <>
      {isDesktop ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{storeProfile?.name || APP_NAME}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-56">
            {storesToList.map((store) => (
              <DropdownMenuItem
                key={store.id}
                onClick={() => handleStoreClick(store.id)}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{store.name}</span>
                {currentStoreId === store.id && (
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
      ) : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
            <TooltipContent>{storeProfile?.name || APP_NAME}</TooltipContent>
          </Tooltip>
          <Drawer open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <DrawerContent className="bg-card border-border px-4">
              <DrawerHeader className="px-0 pb-3 border-b border-border text-left">
                <DrawerTitle className="font-serif text-base font-bold">
                  Switch Store
                </DrawerTitle>
              </DrawerHeader>
              <div className="py-2 space-y-1 max-h-[60dvh] overflow-y-auto">
                {storesToList.map((store) => {
                  const isActive = currentStoreId === store.id;
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => {
                        setMobileSheetOpen(false);
                        handleStoreClick(store.id);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <StoreIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{store.name}</span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
                <div className="pt-2 mt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSheetOpen(false);
                      handleCreateStore();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Create new store</span>
                  </button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      <ConfirmDialog
        open={showAuditReminder}
        onOpenChange={setShowAuditReminder}
        title={reminderTitle}
        description={reminderDescription}
        confirmLabel="Switch Store"
        cancelLabel="Stay Here"
        variant="default"
        onConfirm={handleConfirmSwitch}
      />

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

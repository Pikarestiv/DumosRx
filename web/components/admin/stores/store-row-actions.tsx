import {
  MoreVertical,
  ChevronDown,
  ExternalLink,
  CreditCard,
  History,
  Ban,
  Store as StoreIcon,
  CheckCircle,
  Gift,
  FlaskConical,
  Loader2,
  BadgeCheck,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminStoreActivityPath, adminStoreDetailPath } from "@/lib/admin-routes";
import type { AdminStoreSummary } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export interface StoreRowActionHandlers {
  handleImpersonate: (store: AdminStoreSummary) => void;
  handleViewBilling: (store: AdminStoreSummary) => void;
  setSelectedStore: (store: AdminStoreSummary) => void;
  setIsSuspendDialogOpen: (open: boolean) => void;
  setIsTrialDialogOpen: (open: boolean) => void;
  setIsActivatePlanDialogOpen: (open: boolean) => void;
  handleUnsuspend: (store: AdminStoreSummary) => void;
  handleToggleDemo: (store: AdminStoreSummary) => void;
  handleArchive: (store: AdminStoreSummary) => void;
  handleRestore: (store: AdminStoreSummary) => void;
  handlePurge: (store: AdminStoreSummary) => void;
}

interface StoreRowActionsProps extends StoreRowActionHandlers {
  store: AdminStoreSummary;
  isSuperAdmin: boolean;
  canGrantTrials: boolean;
  canImpersonate: boolean;
  canManageAccountStatus: boolean;
  pendingStoreId: string | null;
  router: AppRouterInstance;
  /** "icon" is the fleet row's bare kebab; "labelled" is the store detail
   * page's visible Actions button. */
  trigger?: "icon" | "labelled";
  /** Set where the menu already sits on the store's own detail page, so the
   * entry that navigates there is not offered. */
  onStoreDetailPage?: boolean;
}

const ITEM_CLASS = "rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold";

export function StoreRowActions({
  store,
  isSuperAdmin,
  canGrantTrials,
  canImpersonate,
  canManageAccountStatus,
  pendingStoreId,
  router,
  trigger = "icon",
  onStoreDetailPage = false,
  handleImpersonate,
  handleViewBilling,
  setSelectedStore,
  setIsSuspendDialogOpen,
  setIsTrialDialogOpen,
  setIsActivatePlanDialogOpen,
  handleUnsuspend,
  handleToggleDemo,
  handleArchive,
  handleRestore,
  handlePurge,
}: StoreRowActionsProps) {
  const isPending = pendingStoreId === store.id;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "labelled" ? (
          <Button
            variant="outline"
            aria-label={`Actions for ${store.name}`}
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
          >
            Actions
            <ChevronDown className="h-4 w-4 ml-2 text-slate-400" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${store.name}`}
            className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
          >
            <MoreVertical className="h-4 w-4 text-slate-400" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-2 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800"
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">
          Actions
        </DropdownMenuLabel>
        {!onStoreDetailPage && (
          <DropdownMenuItem
            className={ITEM_CLASS}
            onClick={() => router.push(adminStoreDetailPath(store.id))}
          >
            <StoreIcon className="h-4 w-4 text-slate-500" />
            View Store Details
          </DropdownMenuItem>
        )}
        {canImpersonate && (
          <DropdownMenuItem className={ITEM_CLASS} onClick={() => handleImpersonate(store)}>
            <ExternalLink className="h-4 w-4 text-indigo-500" />
            Impersonate (Admin)
          </DropdownMenuItem>
        )}
        {isSuperAdmin && (
          <DropdownMenuItem className={ITEM_CLASS} onClick={() => handleViewBilling(store)}>
            <CreditCard className="h-4 w-4 text-emerald-500" />
            View Billing History
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className={ITEM_CLASS}
          onClick={() => router.push(adminStoreActivityPath(store.id, store.name))}
        >
          <History className="h-4 w-4 text-blue-500" />
          Activity Log
        </DropdownMenuItem>
        {canGrantTrials && (
          <DropdownMenuItem
            className={`${ITEM_CLASS} text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors`}
            onClick={() => {
              setSelectedStore(store);
              setIsTrialDialogOpen(true);
            }}
          >
            <Gift className="h-4 w-4" />
            Grant Trial
          </DropdownMenuItem>
        )}
        {canGrantTrials && (
          <DropdownMenuItem
            className={`${ITEM_CLASS} text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors`}
            onClick={() => {
              setSelectedStore(store);
              setIsActivatePlanDialogOpen(true);
            }}
          >
            <BadgeCheck className="h-4 w-4" />
            Activate Paid Plan
          </DropdownMenuItem>
        )}
        {(isSuperAdmin || canManageAccountStatus) && (
          <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />
        )}
        {isSuperAdmin && (
          <DropdownMenuItem
            className={`${ITEM_CLASS} text-purple-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors`}
            disabled={isPending}
            onSelect={(e) => {
              e.preventDefault();
              handleToggleDemo(store);
            }}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {store.is_demo ? "Unmark as Demo" : "Mark as Demo"}
          </DropdownMenuItem>
        )}
        {canManageAccountStatus &&
          (store.status === "Suspended" ? (
            <DropdownMenuItem
              className={`${ITEM_CLASS} text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors`}
              disabled={isPending}
              onSelect={(e) => {
                e.preventDefault();
                handleUnsuspend(store);
              }}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Unsuspend Account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className={`${ITEM_CLASS} text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors`}
              onClick={() => {
                setSelectedStore(store);
                setIsSuspendDialogOpen(true);
              }}
            >
              <Ban className="h-4 w-4" />
              Suspend Account
            </DropdownMenuItem>
          ))}
        {isSuperAdmin && (
          <>
            <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />
            {store.is_archived ? (
              <DropdownMenuItem
                className={`${ITEM_CLASS} text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors`}
                onClick={() => handleRestore(store)}
              >
                <ArchiveRestore className="h-4 w-4" />
                Restore Store
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className={`${ITEM_CLASS} text-slate-500 hover:text-slate-700 transition-colors`}
                onClick={() => handleArchive(store)}
              >
                <Archive className="h-4 w-4" />
                Archive Store
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className={`${ITEM_CLASS} text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors`}
              onClick={() => handlePurge(store)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Permanently
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

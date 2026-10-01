import { Mail, Store as StoreIcon, FlaskConical, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  StoreRowActions,
  type StoreRowActionHandlers,
} from "@/components/admin/stores/store-row-actions";
import { adminStoreDetailPath } from "@/lib/admin-routes";
import type { AdminStoreSummary } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  useAdminAuthStore,
  checkIsSuperAdmin,
  checkHasPermission,
} from "@/lib/store/use-admin-auth-store";

interface StoreTableProps extends StoreRowActionHandlers {
  storeList: AdminStoreSummary[];
  isLoading: boolean;
  /** Id of the store whose unsuspend/demo mutation is currently in flight,
   * so only that row's menu items go disabled. */
  pendingStoreId: string | null;
  router: AppRouterInstance;
}

export function StoreTable({
  storeList,
  isLoading,
  pendingStoreId,
  router,
  ...actions
}: StoreTableProps) {
  const { user } = useAdminAuthStore();
  const isSuperAdmin = checkIsSuperAdmin(user?.role);
  const canGrantTrials = isSuperAdmin || user?.role === "platform_admin";
  const canImpersonate = checkHasPermission(user, "impersonate_store");
  const canManageAccountStatus = checkHasPermission(user, "manage_account_status");

  const openStore = (store: AdminStoreSummary) => router.push(adminStoreDetailPath(store.id));

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">
            Store Details
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
            Owner & Contact
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Subscription
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Fleet Size
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right h-12">
            Total Revenue
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Status
          </TableHead>
          <TableHead className="w-[80px] h-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {storeList.map((store) => (
          <TableRow
            key={store.id}
            className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors cursor-pointer"
            onClick={() => openStore(store)}
          >
            <TableCell className="pl-6 py-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 border border-indigo-500/20 text-xs">
                  {store.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <a
                      href={adminStoreDetailPath(store.id)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openStore(store);
                      }}
                      className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {store.name}
                    </a>
                    {store.is_demo && (
                      <Badge
                        variant="outline"
                        className="bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-500/10 dark:border-purple-500/20 font-bold text-[9px] py-0 px-1.5 gap-1"
                      >
                        <FlaskConical className="h-2.5 w-2.5" />
                        Demo
                      </Badge>
                    )}
                    {store.is_archived && (
                      <Badge
                        variant="outline"
                        className="bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-bold text-[9px] py-0 px-1.5 gap-1"
                      >
                        <Archive className="h-2.5 w-2.5" />
                        Archived
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                    {store.id}
                  </span>
                  {store.device_id && (
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                      Device: {store.device_id}
                    </span>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">
                  {store.owner}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Mail className="h-3 w-3" />
                  {store.email}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex flex-col items-center">
                <Badge
                  variant="outline"
                  className="bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 font-bold text-[10px] py-0.5 capitalize"
                >
                  {store.plan}
                </Badge>
                <span className="text-[9px] text-slate-400 mt-1">Since {store.date}</span>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-black text-xs text-slate-700 dark:text-slate-200">
                  {store.stores}
                </div>
                <StoreIcon className="h-3 w-3 text-slate-400" />
              </div>
            </TableCell>
            <TableCell className="text-right pr-4 font-black text-slate-900 dark:text-white">
              {store.revenue ?? "—"}
            </TableCell>
            <TableCell className="text-center">
              <Badge
                className={
                  store.status === "Active"
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : store.status === "Suspended"
                      ? "bg-rose-500 hover:bg-rose-600"
                      : "bg-amber-500 hover:bg-amber-600"
                }
              >
                {store.status}
              </Badge>
            </TableCell>
            {/* The row navigates on click as a mouse convenience, so the
                kebab's whole cell swallows the event before it gets there. */}
            <TableCell
              className="pr-6"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <StoreRowActions
                store={store}
                isSuperAdmin={isSuperAdmin}
                canGrantTrials={canGrantTrials}
                canImpersonate={canImpersonate}
                canManageAccountStatus={canManageAccountStatus}
                pendingStoreId={pendingStoreId}
                router={router}
                {...actions}
              />
            </TableCell>
          </TableRow>
        ))}
        {storeList.length === 0 && !isLoading && (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-20 text-slate-400 font-medium">
              <div className="flex flex-col items-center gap-2">
                <StoreIcon className="h-10 w-10 opacity-20" />
                <span>No stores match your search criteria</span>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

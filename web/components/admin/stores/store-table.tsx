import {
  MoreVertical,
  ExternalLink,
  CreditCard,
  History,
  Ban,
  Mail,
  Store as StoreIcon,
  CheckCircle,
  Gift,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminStoreSummary } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";

interface StoreTableProps {
  storeList: AdminStoreSummary[];
  isLoading: boolean;
  handleImpersonate: (store: AdminStoreSummary) => void;
  handleViewBilling: (store: AdminStoreSummary) => void;
  setSelectedStore: (store: AdminStoreSummary) => void;
  setIsSuspendDialogOpen: (open: boolean) => void;
  setIsTrialDialogOpen: (open: boolean) => void;
  setIsViewDialogOpen: (open: boolean) => void;
  handleUnsuspend: (store: AdminStoreSummary) => void;
  handleToggleDemo: (store: AdminStoreSummary) => void;
  router: AppRouterInstance;
}

export function StoreTable({
  storeList,
  isLoading,
  handleImpersonate,
  handleViewBilling,
  setSelectedStore,
  setIsSuspendDialogOpen,
  setIsTrialDialogOpen,
  setIsViewDialogOpen,
  handleUnsuspend,
  handleToggleDemo,
  router,
}: StoreTableProps) {
  // Suspend/unsuspend is super_admin-exclusive server-side. Hiding it for
  // platform_admin/agent avoids a dead menu item that would just 403.
  const { user } = useAdminAuthStore();
  const isSuperAdmin = checkIsSuperAdmin(user?.role);
  // grant_trials is shared by super_admin/platform_admin, not agent.
  const canGrantTrials = isSuperAdmin || user?.role === "platform_admin";

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
            className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors"
          >
            <TableCell className="pl-6 py-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 border border-indigo-500/20 text-xs">
                  {store.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                      {store.name}
                    </span>
                    {store.is_demo && (
                      <Badge
                        variant="outline"
                        className="bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-500/10 dark:border-purple-500/20 font-bold text-[9px] py-0 px-1.5 gap-1"
                      >
                        <FlaskConical className="h-2.5 w-2.5" />
                        Demo
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                    {store.id}
                  </span>
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
                <span className="text-[9px] text-slate-400 mt-1">
                  Since {store.date}
                </span>
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
              {store.revenue}
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
            <TableCell className="pr-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                  >
                    <MoreVertical className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">Actions</DropdownMenuLabel>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => {
                      setSelectedStore(store);
                      setIsViewDialogOpen(true);
                    }}
                  >
                    <StoreIcon className="h-4 w-4 text-slate-500" />
                    View Store Details
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => handleImpersonate(store)}
                  >
                    <ExternalLink className="h-4 w-4 text-indigo-500" />
                    Impersonate (Admin)
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => handleViewBilling(store)}
                  >
                    <CreditCard className="h-4 w-4 text-emerald-500" />
                    View Billing History
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => router.push(`/admin/system?search=${store.id}`)}
                  >
                    <History className="h-4 w-4 text-blue-500" />
                    System Logs
                  </DropdownMenuItem>
                  {canGrantTrials && (
                    <DropdownMenuItem
                      className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                      onClick={() => {
                        setSelectedStore(store);
                        setIsTrialDialogOpen(true);
                      }}
                    >
                      <Gift className="h-4 w-4" />
                      Grant Trial
                    </DropdownMenuItem>
                  )}
                  {isSuperAdmin && (
                    <>
                      <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />
                      <DropdownMenuItem
                        className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-purple-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                        onClick={() => handleToggleDemo(store)}
                      >
                        <FlaskConical className="h-4 w-4" />
                        {store.is_demo ? "Unmark as Demo" : "Mark as Demo"}
                      </DropdownMenuItem>
                      {store.status === "Suspended" ? (
                        <DropdownMenuItem
                          className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                          onClick={() => handleUnsuspend(store)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Unsuspend Account
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          onClick={() => {
                            setSelectedStore(store);
                            setIsSuspendDialogOpen(true);
                          }}
                        >
                          <Ban className="h-4 w-4" />
                          Suspend Account
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
        {storeList.length === 0 && !isLoading && (
          <TableRow>
            <TableCell
              colSpan={7}
              className="text-center py-20 text-slate-400 font-medium"
            >
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

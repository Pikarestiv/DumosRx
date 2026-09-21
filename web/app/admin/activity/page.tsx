"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Filter, Loader2, ScrollText, ShieldAlert, ChevronsUpDown, Check, Store as StoreIcon, User as UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdminActivityLogs } from "@/lib/api/admin-activity-hooks";
import { useAdminStores } from "@/lib/api/admin-hooks-stores";
import { useAdminUsers } from "@/lib/api/admin-hooks-users";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { useDebounce } from "@/hooks/use-debounce";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { UserPagination } from "@/components/admin/users/user-pagination";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_FILTERS = [
  { label: "All Actions", value: "" },
  // Per-store actions (client/lib/db/audit-actions.ts)
  { label: "Login", value: "LOGIN" },
  { label: "Login Failed", value: "LOGIN_FAILED" },
  { label: "Logout", value: "LOGOUT" },
  { label: "PIN Changed", value: "PIN_CHANGED" },
  { label: "Sale Return", value: "SALE_RETURN" },
  { label: "Stock Adjustment", value: "STOCK_ADJUSTMENT" },
  { label: "Stock Expired", value: "STOCK_EXPIRED" },
  { label: "Stock Damaged", value: "STOCK_DAMAGED" },
  { label: "Receive PO", value: "RECEIVE_PO" },
  { label: "Reseller Commission Redeemed", value: "RESELLER_COMMISSION_REDEEMED" },
  { label: "Factory Reset", value: "FACTORY_RESET" },
  { label: "Insert", value: "INSERT" },
  { label: "Update", value: "UPDATE" },
  { label: "Delete", value: "DELETE" },
  { label: "Hard Delete", value: "HARD_DELETE" },
  // Platform/super-admin actions (laravel-server's AdminUserService, AdminStoreService, etc.)
  { label: "Grant Free Trial", value: "GRANT_FREE_TRIAL" },
  { label: "Account Suspended", value: "ACCOUNT_SUSPENSION" },
  { label: "Account Unsuspended", value: "ACCOUNT_UNSUSPENSION" },
  { label: "Store Marked Demo", value: "STORE_MARKED_DEMO" },
  { label: "Store Unmarked Demo", value: "STORE_UNMARKED_DEMO" },
  { label: "Admin Impersonation", value: "ADMIN_IMPERSONATION" },
  { label: "User Deactivated", value: "USER_DEACTIVATION" },
  { label: "User Reactivated", value: "USER_REACTIVATION" },
  { label: "User Deleted", value: "USER_DELETION" },
  { label: "Password Reset (Forced)", value: "PASSWORD_RESET_FORCE" },
  { label: "Referral Code Updated", value: "REFERRAL_CODE_UPDATED" },
  { label: "Platform Account Created", value: "PLATFORM_ACCOUNT_CREATED" },
  { label: "Account Registered by Staff", value: "ACCOUNT_REGISTERED_BY_STAFF" },
  { label: "Admin Notification Sent", value: "ADMIN_NOTIFICATION" },
  { label: "Bulk Notification Sent", value: "BULK_ADMIN_NOTIFICATION" },
];

const ACTION_BADGE_STYLES: Record<string, string> = {
  LOGIN: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  LOGOUT: "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400",
  LOGIN_FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  PIN_CHANGED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  SALE_RETURN: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  HARD_DELETE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  DELETE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <Badge
      variant="secondary"
      className={`font-bold ${ACTION_BADGE_STYLES[action] || "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"}`}
    >
      {action.replace(/_/g, " ")}
    </Badge>
  );
}

interface SelectedEntity {
  id: string;
  label: string;
}

/** Single-select search-and-pick popover, shared shape for the Store and
 * User activity-log filters below. Deliberately not the multi-select
 * UserSelector used for broadcast targeting elsewhere in admin/ - a log
 * filter narrows to exactly one store/user at a time, not a target list. */
function StoreFilterPicker({
  value,
  onChange,
}: {
  value: SelectedEntity | null;
  onChange: (value: SelectedEntity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const { data, isLoading } = useAdminStores(1, debouncedSearch);
  const stores = data?.data || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className={cn("font-bold border-2 max-w-[160px]", value && "text-indigo-600 border-indigo-200 dark:border-indigo-500/30")}
        >
          <StoreIcon className="h-4 w-4 mr-2 shrink-0" />
          <span className="truncate">{value?.label || "All Stores"}</span>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search stores..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
          </div>
          <CommandList>
            <CommandEmpty>{isLoading ? "Searching..." : "No stores found."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                All Stores
              </CommandItem>
              {stores.map((store) => (
                <CommandItem
                  key={store.id}
                  onSelect={() => {
                    onChange({ id: store.id, label: store.name });
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value?.id === store.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{store.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{store.owner}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function UserFilterPicker({
  value,
  onChange,
}: {
  value: SelectedEntity | null;
  onChange: (value: SelectedEntity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const { data, isLoading } = useAdminUsers(1, debouncedSearch);
  const users = data?.data || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className={cn("font-bold border-2 max-w-[160px]", value && "text-indigo-600 border-indigo-200 dark:border-indigo-500/30")}
        >
          <UserIcon className="h-4 w-4 mr-2 shrink-0" />
          <span className="truncate">{value?.label || "All Users"}</span>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
          </div>
          <CommandList>
            <CommandEmpty>{isLoading ? "Searching..." : "No users found."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                All Users
              </CommandItem>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  onSelect={() => {
                    onChange({ id: user.id, label: user.name });
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value?.id === user.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AdminActivityLogPageContent() {
  // Deep-link support for the "Activity Log" action in the store fleet row
  // menu: /admin/activity?store_id=<id>&store_name=<name> opens pre-filtered
  // to that store. The name is carried along only so the picker can be
  // labelled without an extra lookup; the id is what the query filters on.
  const searchParams = useSearchParams();
  const initialStoreId = searchParams.get("store_id");
  const initialStoreName = searchParams.get("store_name");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState<SelectedEntity | null>(
    initialStoreId
      ? { id: initialStoreId, label: initialStoreName || initialStoreId }
      : null,
  );
  const [userFilter, setUserFilter] = useState<SelectedEntity | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading, error, refetch } = useAdminActivityLogs(
    page,
    debouncedSearch,
    actionFilter,
    storeFilter?.id || "",
    userFilter?.id || "",
    dateFrom,
    dateTo,
  );

  const logs = response?.data || [];
  const meta = response?.meta;

  // An inverted range is a filter that can never match anything; without this
  // hint the empty table reads as a genuine "no activity" result.
  const isInvertedDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (meta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  if (isLoading && !response) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
          Activity Log
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          Every staff action across every store on the platform, in one place.
        </p>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full max-w-sm group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search by user, email, or description..."
                className="pl-10 bg-slate-50 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />
              )}
              <StoreFilterPicker
                value={storeFilter}
                onChange={(v) => {
                  setStoreFilter(v);
                  setPage(1);
                }}
              />
              <UserFilterPicker
                value={userFilter}
                onChange={(v) => {
                  setUserFilter(v);
                  setPage(1);
                }}
              />
              <div className="flex items-center gap-2">
                <DatePickerInput
                  value={dateFrom}
                  onChange={(val) => {
                    setDateFrom(val);
                    setPage(1);
                  }}
                  placeholder="From"
                  inputClassName="h-9 w-32 border-2 font-bold text-xs"
                />
                <span className="text-slate-400 text-xs font-bold">to</span>
                <DatePickerInput
                  value={dateTo}
                  onChange={(val) => {
                    setDateTo(val);
                    setPage(1);
                  }}
                  placeholder="To"
                  inputClassName="h-9 w-32 border-2 font-bold text-xs"
                />
              </div>
              {isInvertedDateRange && (
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  &ldquo;From&rdquo; is after &ldquo;To&rdquo; &mdash; this range can never match.
                </p>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="font-bold border-2">
                    <Filter className="h-4 w-4 mr-2" />
                    {ACTION_FILTERS.find((f) => f.value === actionFilter)?.label ||
                      "All Actions"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl max-h-96 overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">
                    Action Type
                  </DropdownMenuLabel>
                  {ACTION_FILTERS.map((f) => (
                    <DropdownMenuItem
                      key={f.value}
                      className="rounded-xl px-3 py-2 cursor-pointer font-bold"
                      onClick={() => {
                        setActionFilter(f.value);
                        setPage(1);
                      }}
                    >
                      {f.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {(actionFilter || storeFilter || userFilter || dateFrom || dateTo || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-bold text-slate-500"
                  onClick={() => {
                    setSearch("");
                    setActionFilter("");
                    setStoreFilter(null);
                    setUserFilter(null);
                    setDateFrom("");
                    setDateTo("");
                    setPage(1);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShieldAlert className="h-10 w-10 text-rose-500" />
                <p className="text-rose-500 font-bold">
                  {error instanceof Error ? error.message : "Failed to load activity logs"}
                </p>
                <Button onClick={() => void refetch()} variant="outline">
                  Retry
                </Button>
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16 text-slate-400">
                      <ScrollText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                      No activity found for this filter.
                    </TableCell>
                  </TableRow>
                )}
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell>
                      {log.user ? (
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {log.user.name}
                          </p>
                          <p className="text-xs text-slate-400">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.store ? (
                        log.store.name
                      ) : (
                        <span className="text-slate-400">Platform</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-slate-500 dark:text-slate-400">
                      {log.description || "N/A"}
                    </TableCell>
                    <TableCell className="text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateSafe(log.created_at, "dd/MM/yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </div>

          {!error && meta && <UserPagination userMeta={meta} handlePageChange={handlePageChange} />}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminActivityLogPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminActivityLogPageContent />
    </Suspense>
  );
}

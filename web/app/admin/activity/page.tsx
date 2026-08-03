"use client";

import { useState } from "react";
import { Search, Filter, Loader2, ScrollText } from "lucide-react";
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
import { useAdminActivityLogs } from "@/lib/api/admin-activity-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { UserPagination } from "@/components/admin/users/user-pagination";

const ACTION_FILTERS = [
  { label: "All Actions", value: "" },
  { label: "Login", value: "LOGIN" },
  { label: "Login Failed", value: "LOGIN_FAILED" },
  { label: "Logout", value: "LOGOUT" },
  { label: "PIN Changed", value: "PIN_CHANGED" },
  { label: "Sale Return", value: "SALE_RETURN" },
  { label: "Stock Adjustment", value: "STOCK_ADJUSTMENT" },
  { label: "Receive PO", value: "RECEIVE_PO" },
  { label: "Insert", value: "INSERT" },
  { label: "Update", value: "UPDATE" },
  { label: "Delete", value: "DELETE" },
  { label: "Hard Delete", value: "HARD_DELETE" },
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

export default function AdminActivityLogPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading } = useAdminActivityLogs(
    page,
    debouncedSearch,
    actionFilter,
  );

  const logs = response?.data || [];
  const meta = response?.meta;

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
            <div className="flex items-center gap-3">
              {isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="font-bold border-2">
                    <Filter className="h-4 w-4 mr-2" />
                    {ACTION_FILTERS.find((f) => f.value === actionFilter)?.label ||
                      "All Actions"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl">
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
            </div>
          </div>

          <div className="overflow-x-auto">
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
                      {log.description || "—"}
                    </TableCell>
                    <TableCell className="text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {meta && <UserPagination userMeta={meta} handlePageChange={handlePageChange} />}
        </CardContent>
      </Card>
    </div>
  );
}

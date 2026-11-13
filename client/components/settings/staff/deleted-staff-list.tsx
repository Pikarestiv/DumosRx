import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { RotateCcw, Loader2, Users, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { StaffListItem } from "@/lib/types/user";
import { useMediaQuery } from "@/hooks/use-media-query";
import { staffRoleLabel } from "./staff-list-parts";

interface DeletedStaffListProps {
  users: StaffListItem[];
  isLoading: boolean;
  onRecover: (id: string, name: string) => void;
  isRecovering?: boolean;
}

export function DeletedStaffList({
  users,
  isLoading,
  onRecover,
  isRecovering = false,
}: DeletedStaffListProps) {
  const [search, setSearch] = useState("");
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase().trim();
    return users.filter((u) => {
      const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
      const username = (u.username || "").toLowerCase();
      return fullName.includes(term) || username.includes(term);
    });
  }, [users, search]);

  const cleanUsername = (username?: string) =>
    (username || "").replace(/_del_\d+$/, "");

  const isEmpty = !isLoading && filteredUsers.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search deleted staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        {isDesktop && (
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deleted Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!!isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {isEmpty && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8">
                      <EmptyState
                        icon={Users}
                        title="No deleted staff accounts"
                        description={
                          search
                            ? "No deleted accounts match your search."
                            : "Staff accounts deleted from your roster will appear here so you can recover them at any time."
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {!isEmpty &&
                  filteredUsers.map((user) => {
                    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
                    return (
                      <TableRow key={user.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs">
                              {user.first_name?.charAt(0).toUpperCase() || "U"}
                            </div>
                            <span className="font-medium text-foreground">
                              {fullName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {cleanUsername(user.username)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={user.permission_group_name ? undefined : "capitalize"}>
                            {staffRoleLabel(user)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50"
                          >
                            Deleted
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDateSafe(user.updated_at, "dd/MM/yyyy HH:mm", "N/A")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRecovering}
                            onClick={() => onRecover(user.id, fullName)}
                            className="h-8 gap-1.5 text-xs font-medium text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Recover Account
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Mobile View */}
        {!isDesktop && (
          <div className="sm:hidden divide-y divide-border">
            {!!isLoading && (
              <div className="h-24 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {isEmpty && (
              <EmptyState
                icon={Users}
                title="No deleted staff accounts"
                className="py-6"
                description={
                  search
                    ? "No deleted accounts match your search."
                    : "Staff accounts deleted from your roster will appear here so you can recover them at any time."
                }
              />
            )}
            {!isEmpty &&
              filteredUsers.map((user) => {
                const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
                return (
                  <div key={user.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs">
                          {user.first_name?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{fullName}</div>
                          <div className="font-mono text-xs text-muted-foreground truncate">
                            {cleanUsername(user.username)}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-700 border-red-200 text-xs shrink-0"
                      >
                        Deleted
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        Deleted: {formatDateSafe(user.updated_at, "dd/MM/yyyy HH:mm", "N/A")}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRecovering}
                        onClick={() => onRecover(user.id, fullName)}
                        className="h-8 gap-1 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Recover
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}


import { Key, KeyRound, Users, Edit2, UserX, Shield, RotateCcw, Trash2 } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { checkIsAdmin } from "@/lib/context/auth-context";
import type { StaffListItem } from "@/lib/types/user";

export function NoStaffFoundRow({
  isAdmin,
  onAddStaff,
}: {
  isAdmin: boolean;
  onAddStaff?: () => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={6} className="h-24">
        <EmptyState
          icon={Users}
          title="No staff members found"
          action={
            isAdmin && onAddStaff
              ? { label: "Add Staff Member", onClick: onAddStaff }
              : undefined
          }
        />
      </TableCell>
    </TableRow>
  );
}

export function PinBadge({ hasPin }: { hasPin: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
        hasPin
          ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
          : "text-amber-600 bg-amber-50 dark:bg-amber-900/30"
      }`}
    >
      {hasPin ? <Key className="w-2.5 h-2.5" /> : <KeyRound className="w-2.5 h-2.5" />}
      {hasPin ? "PIN set" : "No PIN"}
    </span>
  );
}

export function StaffListMobileCard({
  user,
  isMainAccount,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  user: StaffListItem;
  isMainAccount: boolean;
  onEdit: (user: StaffListItem) => void;
  onDeactivate: (user: StaffListItem) => void;
  onReactivate: (id: string) => void;
  onDelete: (user: StaffListItem) => void;
}) {
  return (
    <div
      key={user.id}
      className={
        isMainAccount
          ? "p-4 space-y-2 bg-indigo-50/50 dark:bg-indigo-900/10"
          : "p-4 space-y-2"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            {user.first_name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">
              {`${user.first_name || ""} ${user.last_name || ""}`.trim()}
            </div>
            <div className="font-mono text-xs text-muted-foreground truncate">
              {user.username}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(user)}
            aria-label={`Edit ${user.username}`}
            className="h-8 w-8 text-muted-foreground hover:text-muted"
            disabled={user.id === "default-admin"}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          {user.is_active === 0 ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onReactivate(user.id)}
              aria-label={`Reactivate ${user.username}`}
              className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDeactivate(user)}
              aria-label={`Deactivate ${user.username}`}
              className="h-8 w-8 text-muted-foreground hover:text-amber-600"
              disabled={user.id === "default-admin"}
            >
              <UserX className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(user)}
            aria-label={`Delete ${user.username}`}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={user.id === "default-admin" || isMainAccount}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {isMainAccount && (
          <Badge className="h-5 px-1.5 text-[9px] bg-primary">
            Main Account
          </Badge>
        )}
        <Badge
          variant={checkIsAdmin(user.role) ? "default" : "secondary"}
          className="capitalize"
        >
          {checkIsAdmin(user.role) && <Shield className="w-3 h-3" />}
          {user.role?.replace("_", " ") || "Staff"}
        </Badge>
        <Badge
          variant="outline"
          className={
            user.is_active === 0
              ? "bg-slate-50 text-slate-500 border-slate-200"
              : "bg-green-50 text-green-700 border-green-200"
          }
        >
          {user.is_active === 0 ? "Inactive" : "Active"}
        </Badge>
        <PinBadge hasPin={user.has_pin === 1} />
      </div>

      <div className="text-xs text-muted-foreground">
        Created:{" "}
        {user.created_at ? formatDateToDDMMYYYY(user.created_at) : "N/A"}
      </div>
    </div>
  );
}

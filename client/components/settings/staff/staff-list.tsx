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
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import {
  Edit2,
  Trash2,
  Shield,
  Loader2,
  Users,
  Key,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { checkIsAdmin } from "@/lib/context/auth-context";
import type { StaffListItem } from "@/lib/types/user";

interface StaffListProps {
  users: StaffListItem[];
  isLoading: boolean;
  onEdit: (user: StaffListItem) => void;
  onDelete: (id: string, name: string) => void;
  onReactivate: (id: string) => void;
}

function NoStaffFoundRow() {
  return (
    <TableRow>
      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
        <Users className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No staff members found.
      </TableCell>
    </TableRow>
  );
}

export function StaffList({
  users,
  isLoading,
  onEdit,
  onDelete,
  onReactivate,
}: StaffListProps) {
  const handleEditClick = (user: StaffListItem) => {
    if (user.id === "default-admin" || user.username === "admin") {
      toast.error("Default admin cannot be edited");
      return;
    }
    onEdit(user);
  };

  const handleDeleteClick = (user: StaffListItem) => {
    if (user.id === "default-admin" || user.username === "admin") {
      toast.error("Default admin cannot be deleted");
      return;
    }
    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    onDelete(user.id, name);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
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
        {!isLoading && users.length === 0 && <NoStaffFoundRow />}
        {!(!isLoading && users.length === 0) &&
          [...users]
            .sort((a, b) => {
              const isAMain = !a.store_id || a.role === "admin";
              const isBMain = !b.store_id || b.role === "admin";
              if (isAMain && !isBMain) return -1;
              if (!isAMain && isBMain) return 1;
              return 0;
            })
            .map((user) => {
              const isMainAccount = !user.store_id || user.role === "admin";
              return (
                <TableRow
                  key={user.id}
                  className={
                    isMainAccount
                      ? "bg-indigo-50/50 dark:bg-indigo-900/10"
                      : undefined
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {user.first_name?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <span className="font-medium">
                        {`${user.first_name || ""} ${user.last_name || ""}`.trim()}
                      </span>
                      {isMainAccount && (
                        <Badge className="h-5 px-1.5 text-[9px] bg-primary">
                          Main Account
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-2">
                      {user.username}
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                        <Key className="w-2.5 h-2.5" />
                        PIN set
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {checkIsAdmin(user.role) && (
                        <Shield className="w-3 h-3 text-emerald-500" />
                      )}
                      <Badge
                        variant={
                          checkIsAdmin(user.role) ? "default" : "secondary"
                        }
                        className="capitalize"
                      >
                        {user.role?.replace("_", " ") || "Staff"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {!!user.created_at && formatDateToDDMMYYYY(user.created_at)}
                    {!user.created_at && "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(user)}
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        disabled={user.id === "default-admin"}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {user.is_active === 0 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onReactivate(user.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(user)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={user.id === "default-admin"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
      </TableBody>
    </Table>
  );
}

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
import { Edit2, Trash2, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StaffListProps {
  users: any[];
  isLoading: boolean;
  onEdit: (user: any) => void;
  onDelete: (id: string, name: string) => void;
}

export function StaffList({ users, isLoading, onEdit, onDelete }: StaffListProps) {
  const handleEditClick = (user: any) => {
    if (user.id === "default-admin" || user.username === "admin") {
      toast.error("Default admin cannot be edited");
      return;
    }
    onEdit(user);
  };

  const handleDeleteClick = (user: any) => {
    if (user.id === "default-admin" || user.username === "admin") {
      toast.error("Default admin cannot be deleted");
      return;
    }
    const name = user.first_name || user.last_name
      ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
      : user.name;
    onDelete(user.id, name);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </TableCell>
          </TableRow>
        ) : users.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
              No staff members found.
            </TableCell>
          </TableRow>
        ) : (
          users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {user.first_name?.charAt(0).toUpperCase() ||
                      (user.name && user.name.charAt(0).toUpperCase()) ||
                      "U"}
                  </div>
                  <span className="font-medium">
                    {user.first_name || user.last_name
                      ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                      : user.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {user.username}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {user.role === "admin" && (
                    <Shield className="w-3 h-3 text-emerald-500" />
                  )}
                  <Badge
                    variant={user.role === "admin" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {user.role?.replace("_", " ") || "Staff"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.created_at
                  ? formatDateToDDMMYYYY(user.created_at)
                  : "N/A"}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(user)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={user.id === "default-admin"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

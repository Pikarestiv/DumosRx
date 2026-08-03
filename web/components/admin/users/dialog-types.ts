import type { AdminUser } from "@/lib/types/admin";

export interface BaseDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: AdminUser | null;
  setSelectedUser: (user: AdminUser | null) => void;
}

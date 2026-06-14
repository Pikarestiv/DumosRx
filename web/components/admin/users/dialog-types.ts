export interface BaseDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: any;
  setSelectedUser: (user: any) => void;
}

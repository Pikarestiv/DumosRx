import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { STAFF_ROLES } from "@/lib/constants/roles";
import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { useStore } from "@/lib/context/store-context";
import type { StaffUpdatePayload, StaffListItem } from "@/lib/types/user";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StaffFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: StaffListItem | null; // null if creating
  activeStoreId: string | null;
  onSuccess: () => void;
}

export function StaffFormDialog({
  isOpen,
  onOpenChange,
  userToEdit,
  activeStoreId,
  onSuccess,
}: StaffFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { create, update } = useMutateUser();
  const { availableStores } = useStore();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    pin: "",
    role: "sales_staff",
    store_id: activeStoreId || "",
  });

  const isEditing = !!userToEdit;

  useEffect(() => {
    if (isOpen) {
      if (userToEdit) {
        setFormData({
          first_name: userToEdit.first_name || "",
          last_name: userToEdit.last_name || "",
          username: userToEdit.username || "",
          email: userToEdit.email || "",
          pin: "", // Leave empty unless modifying
          role: userToEdit.role || "sales_staff",
          store_id: userToEdit.store_id || activeStoreId || "",
        });
      } else {
        setFormData({
          first_name: "",
          last_name: "",
          username: "",
          email: "",
          pin: "",
          role: "sales_staff",
          store_id: activeStoreId || "",
        });
      }
    }
  }, [isOpen, userToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.first_name || !formData.last_name || !formData.username) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!isEditing && (!formData.pin || formData.pin.length < 4)) {
      toast.error("PIN must be at least 4 digits");
      return;
    }

    if (isEditing && formData.pin && formData.pin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }

    const pinChanged = isEditing && !!formData.pin && formData.pin.length === 4;

    setIsSubmitting(true);
    try {
      if (isEditing) {
        const updateData: StaffUpdatePayload = {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          username: formData.username,
          email: formData.email,
          role: formData.role,
        };
        // Only touch store_id when the selector was actually shown to the
        // user (multi-store accounts). Single-store accounts never render
        // it, so sending it unconditionally would silently overwrite
        // main-account rows (store_id === null) with activeStoreId.
        if (availableStores && availableStores.length > 1) {
          updateData.store_id = formData.store_id;
        }
        if (formData.pin) {
          updateData.pin = formData.pin;
        }

        await update.mutateAsync({ id: userToEdit.id, data: updateData });
        toast.success(
          "Staff account updated successfully",
          pinChanged
            ? {
                description:
                  "PIN changed. Restart the app (or refresh the tab, if using it in a browser) on that person's device to apply it right away.",
                duration: 8000,
              }
            : undefined,
        );
      } else {
        const dataToSave = {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          username: formData.username,
          email: formData.email,
          pin: formData.pin,
          role: formData.role,
          store_id: formData.store_id || activeStoreId || "",
        };

        await create.mutateAsync(dataToSave);
        toast.success("Staff account created successfully");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Failed to save user:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE")) {
        toast.error("Username already exists");
      } else {
        toast.error(
          isEditing
            ? "Failed to update staff account"
            : "Failed to create staff account",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={onOpenChange}
      title={
        <>
          {!!isEditing && "Edit Staff Member"}
          {!isEditing && "Add New Staff Member"}
        </>
      }
      description={
        <>
          {!!isEditing && "Update sub-account details and permissions."}
          {!isEditing && "Create a sub-account with specific permissions."}
        </>
      }
      footer={
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="staff-form" disabled={isSubmitting}>
            {!!isSubmitting && (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {!!isEditing && "Saving..."}
                {!isEditing && "Creating..."}
              </>
            )}
            {!!(!isSubmitting && isEditing) && "Save Changes"}
            {!(!isSubmitting && isEditing) && "Create Account"}
          </Button>
        </DialogFooter>
      }
    >
      <form
        id="staff-form"
        onSubmit={handleSubmit}
        className="space-y-4 py-4 my-0.5"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="first_name">First Name *</Label>
            <Input
              id="first_name"
              placeholder="e.g. John"
              value={formData.first_name}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  first_name: e.target.value,
                }))
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last_name">Last Name *</Label>
            <Input
              id="last_name"
              placeholder="e.g. Doe"
              value={formData.last_name}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  last_name: e.target.value,
                }))
              }
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              placeholder="johndoe"
              value={formData.username}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  username: e.target.value.toLowerCase(),
                }))
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pin">
              {!!isEditing && "New Login PIN"}
              {!isEditing && "Login PIN *"}
            </Label>
            <div className="flex justify-start">
              <InputOTP
                maxLength={4}
                value={formData.pin}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    pin: value.replace(/\D/g, ""),
                  }))
                }
                className="md:input-mode-numeric"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {isEditing && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Leave blank to keep existing PIN
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email (Optional)</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="role">System Role</Label>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Determines what the staff member can access. Cashiers can
                    only make sales, Managers can view stock batches, and Admins
                    have full access.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select
            value={formData.role}
            onValueChange={(val) =>
              setFormData((prev) => ({ ...prev, role: val }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {availableStores && availableStores.length > 1 && (
          <div className="grid gap-2">
            <Label htmlFor="store_id">Assigned Store</Label>
            <Select
              value={formData.store_id}
              onValueChange={(val) =>
                setFormData((prev) => ({ ...prev, store_id: val }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {availableStores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}

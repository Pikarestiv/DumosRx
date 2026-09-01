import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { useStore } from "@/lib/context/store-context";
import type { StaffUpdatePayload, StaffListItem } from "@/lib/types/user";
import { StaffFormFields } from "./staff-form-fields";

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
  const { create, update } = useMutateUser();
  const isSubmitting = create.isPending || update.isPending;
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

    if (isSubmitting) return;
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
      headerClassName="py-0"
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
      <StaffFormFields
        formId="staff-form"
        onSubmit={handleSubmit}
        formData={formData}
        setFormData={setFormData}
        isEditing={isEditing}
        availableStores={availableStores}
      />
    </ResponsiveModal>
  );
}

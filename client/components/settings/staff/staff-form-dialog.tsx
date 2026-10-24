import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { useStore } from "@/lib/context/store-context";
import type { StaffUpdatePayload, StaffListItem } from "@/lib/types/user";
import { StaffFormFields, type StaffFormData } from "./staff-form-fields";

// Resolves the store_id to actually persist for a staff row from the controlled <select>'s value (empty string when unsele…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-staff-staff-form-dialog-tsx-L12
export function resolveStaffStoreId(
  formStoreId: string,
  activeStoreId: string | null,
): string | null {
  return formStoreId || activeStoreId || null;
}

// Every submit-blocking rule for the staff form, as a pure function so each one is testable without a rendered dialog (sam…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-staff-staff-form-dialog-tsx-L28
export function validateStaffForm(
  formData: StaffFormData,
  isEditing: boolean,
): string | null {
  if (!formData.first_name || !formData.last_name || !formData.username) {
    return "Please fill in all required fields";
  }
  if (!formData.permission_group_id) {
    return "Please select a Group for this staff member";
  }
  if (!isEditing && (!formData.pin || formData.pin.length < 4)) {
    return "PIN must be at least 4 digits";
  }
  if (isEditing && formData.pin && formData.pin.length < 4) {
    return "PIN must be at least 4 digits";
  }
  return null;
}

function buildStaffFormData(
  userToEdit: StaffListItem | null | undefined,
  activeStoreId: string | null,
): StaffFormData {
  if (!userToEdit) {
    return {
      first_name: "",
      last_name: "",
      username: "",
      email: "",
      pin: "",
      role: "sales_staff",
      store_id: activeStoreId || "",
      permission_group_id: undefined,
    };
  }
  return {
    first_name: userToEdit.first_name || "",
    last_name: userToEdit.last_name || "",
    username: userToEdit.username || "",
    email: userToEdit.email || "",
    pin: "",
    role: userToEdit.role || "sales_staff",
    store_id: userToEdit.store_id || activeStoreId || "",
    permission_group_id: userToEdit.permission_group_id ?? undefined,
  };
}

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
  const [formData, setFormData] = useState<StaffFormData>(() =>
    buildStaffFormData(isOpen ? userToEdit : null, activeStoreId),
  );

  const isEditing = !!userToEdit;

  const [formSource, setFormSource] = useState({ isOpen, userToEdit, activeStoreId });
  if (
    formSource.isOpen !== isOpen ||
    formSource.userToEdit !== userToEdit ||
    formSource.activeStoreId !== activeStoreId
  ) {
    setFormSource({ isOpen, userToEdit, activeStoreId });
    if (isOpen) setFormData(buildStaffFormData(userToEdit, activeStoreId));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateStaffForm(formData, isEditing);
    if (validationError) {
      toast.error(validationError);
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
          // Sent alongside role so the two never disagree about which staff member they describe - see staff-form-fields.tsx's Group…
          // Rationale: docs/CLIENT_COMMENTS.md#line-components-settings-staff-staff-form-dialog-tsx-L134
          permission_group_id: formData.permission_group_id,
        };
        // Only touch store_id when the selector was actually shown to the user (multi-store accounts).
        // Rationale: docs/CLIENT_COMMENTS.md#line-components-settings-staff-staff-form-dialog-tsx-L139
        if (availableStores && availableStores.length > 1) {
          updateData.store_id = resolveStaffStoreId(formData.store_id, activeStoreId);
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
          store_id: resolveStaffStoreId(formData.store_id, activeStoreId),
          permission_group_id: formData.permission_group_id,
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
        onSubmit={(e) => void handleSubmit(e)}
        formData={formData}
        setFormData={setFormData}
        isEditing={isEditing}
        availableStores={availableStores}
      />
    </ResponsiveModal>
  );
}

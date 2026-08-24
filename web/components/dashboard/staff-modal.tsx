"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateStaffMutation,
  useUpdateStaffMutation,
} from "@/lib/api/hooks";
import type { StaffMember, DashboardStore } from "@/lib/types/dashboard";
import { getChangedFields, type StaffFormData } from "@/lib/utils/staff-form";
import { StaffModalFields } from "./staff-modal-fields";

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stores: DashboardStore[];
  staffMember?: StaffMember | null; // If editing
}

export function StaffModal({
  isOpen,
  onClose,
  onSuccess,
  stores,
  staffMember,
}: StaffModalProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!staffMember;

  const [formData, setFormData] = useState<StaffFormData>({
    first_name: "",
    last_name: "",
    email: "",
    username: "",
    role: "sales_staff",
    store_id: "",
    password: "",
    pin: "",
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        first_name: staffMember?.first_name || "",
        last_name: staffMember?.last_name || "",
        email: staffMember?.email || "",
        username: staffMember?.username || "",
        role: staffMember?.role || "sales_staff",
        store_id:
          staffMember?.store_id || (stores.length > 0 ? stores[0].id : ""),
        password: "",
        pin: staffMember?.pin || "",
      });
    }
  }, [staffMember, isOpen, stores]);

  const createMutation = useCreateStaffMutation();
  const updateMutation = useUpdateStaffMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // A PIN change writes straight to the cloud DB. The terminal that
    // account actually logs in on only sees it once its device pulls that
    // change down, which the login screen itself has no way to prompt for.
    // Flag it here instead, where the person making the change can act on it.
    const pinChanged =
      isEditing &&
      formData.pin !== (staffMember?.pin || "") &&
      formData.pin.length > 0;

    const onSettled = () => setLoading(false);
    const onMutationSuccess = () => {
      toast.success(
        isEditing
          ? "Staff account updated successfully"
          : "Staff account created successfully",
        pinChanged
          ? {
              description:
                "PIN changed. Restart the app (or refresh the tab, if using it in a browser) on that person's device to apply it right away.",
              duration: 8000,
            }
          : undefined,
      );
      onSuccess();
      onClose();
    };
    const onMutationError = (err: Error) => {
      toast.error(err.message || "Failed to save staff account");
    };

    if (isEditing && staffMember) {
      updateMutation.mutate(
        {
          id: staffMember.id,
          payload: getChangedFields(formData, staffMember),
        },
        { onSuccess: onMutationSuccess, onError: onMutationError, onSettled },
      );
    } else {
      createMutation.mutate(formData, {
        onSuccess: onMutationSuccess,
        onError: onMutationError,
        onSettled,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-137.5 border-none shadow-2xl overflow-hidden p-0">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8">
          <DialogHeader className="mb-6">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 shadow-inner">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-2xl font-black">
              {isEditing ? "Edit Staff Details" : "Create New Staff"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium">
              Set up a new master or sub-account for your shops.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <StaffModalFields
              formData={formData}
              setFormData={setFormData}
              stores={stores}
              isEditing={isEditing}
              loading={loading}
              onClose={onClose}
            />
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

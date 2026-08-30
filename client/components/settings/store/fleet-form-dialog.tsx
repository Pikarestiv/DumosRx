import { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import { useSaveFleetStoreMutation } from "@/lib/hooks/use-fleet-mutations";
import type { FleetStore } from "@/lib/types/store";

const STORE_TYPES = ["pharmacy", "supermarket", "grocery", "general", "retail"] as const;

interface FleetFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  storeToEdit?: FleetStore | null;
  activeStoreId: string | null;
  onSuccess: () => void;
}

export function FleetFormDialog({
  isOpen,
  onOpenChange,
  storeToEdit,
  activeStoreId,
  onSuccess,
}: FleetFormDialogProps) {
  const { refetch } = useStore();
  const saveStoreMutation = useSaveFleetStoreMutation();
  const isSubmitting = saveStoreMutation.isPending;
  const isEditing = !!storeToEdit;
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    address: "",
    phone: "",
    store_type: "pharmacy",
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: storeToEdit?.name || "",
        location: storeToEdit?.location || "",
        address: storeToEdit?.address || "",
        phone: storeToEdit?.phone || "",
        store_type: storeToEdit?.store_type || "pharmacy",
      });
    }
  }, [isOpen, storeToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Store name is required");
      return;
    }

    if (isSubmitting) return;
    saveStoreMutation.mutate(
      {
        isEditing,
        storeId: storeToEdit?.id,
        formData,
        activeStoreId,
      },
      {
        onSuccess: async () => {
          if (isEditing && storeToEdit && activeStoreId === storeToEdit.id) {
            await refetch();
          }
          toast.success(
            isEditing ? "Store details updated successfully" : "New store registered successfully",
          );
          onSuccess();
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to save store");
        },
      },
    );
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Store Details" : "Register New Store"}
      description={
        isEditing
          ? "Update the information for this store location."
          : "Expand your fleet by adding a new store instance."
      }
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="fleet-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Register Store"}
          </Button>
        </DialogFooter>
      }
    >
      <form id="fleet-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Store Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="store_type">Store Type</Label>
          <Select
            value={formData.store_type}
            onValueChange={(val) => setFormData({ ...formData, store_type: val })}
          >
            <SelectTrigger id="store_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORE_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>
    </ResponsiveModal>
  );
}

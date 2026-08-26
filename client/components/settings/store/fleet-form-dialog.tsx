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
import { apiClient } from "@/lib/api/client";
import { update } from "@/lib/db/base-helpers";
import { useStore } from "@/lib/context/store-context";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

    setIsSubmitting(true);
    try {
      if (isEditing && storeToEdit) {
        await apiClient.updateStore(storeToEdit.id, formData);

        // The Business Information card writes name/address/phone to the
        // local `stores` row and queues a sync push independently of Fleet.
        // If Fleet edits the active store's fields but the local row still
        // holds pre-edit values, that queued push would silently revert
        // this edit on the next sync. Writing the same fields locally too
        // (only for the store this device is actually running) keeps local
        // state in step with what we just wrote to the cloud.
        if (activeStoreId && storeToEdit.id === activeStoreId) {
          await update("stores", activeStoreId, {
            name: formData.name,
            location: formData.location,
            address: formData.address,
            phone: formData.phone,
            store_type: formData.store_type,
          });
          await refetch();
        }

        toast.success("Store details updated successfully");
      } else {
        await apiClient.createStore(formData);
        toast.success("New store registered successfully");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save store");
    } finally {
      setIsSubmitting(false);
    }
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

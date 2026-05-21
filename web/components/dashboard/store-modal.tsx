"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Store, MapPin, Phone, Home } from "lucide-react";
import { toast } from "sonner";
import { useCreateStoreMutation, useUpdateStoreMutation } from "@/lib/api/hooks";

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  store?: any; // If editing
}

export function StoreModal({ isOpen, onClose, onSuccess, store }: StoreModalProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!store;

  const [formData, setFormData] = useState({
    name: "",
    location: "",
    address: "",
    phone: "",
  });

  useEffect(() => {
    if (isOpen) {
       
      setFormData({
        name: store?.name || "",
        location: store?.location || "",
        address: store?.address || "",
        phone: store?.phone || "",
      });
    }
  }, [store, isOpen]);

  const createMutation = useCreateStoreMutation();
  const updateMutation = useUpdateStoreMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const mutation = isEditing ? updateMutation : createMutation;
    const mutationPayload = isEditing ? { id: store.id, payload: formData } : formData;

    mutation.mutate(mutationPayload as any, {
      onSuccess: () => {
        toast.success(isEditing ? "Store details updated successfully" : "New store registered successfully");
        onSuccess();
        onClose();
      },
      onError: (err: any) => {
        toast.error(err.message || "Failed to save store");
      },
      onSettled: () => {
        setLoading(false);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] border-none shadow-2xl overflow-hidden p-0">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8">
          <DialogHeader className="mb-6">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 shadow-inner">
                <Store className="h-6 w-6" />
            </div>
            <DialogTitle className="text-2xl font-black">{isEditing ? "Edit Store Details" : "Register New Store"}</DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium">
                {isEditing 
                  ? "Update the information for this pharmacy location."
                  : "Expand your fleet by adding a new pharmacy instance."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider opacity-60">Store Name</Label>
              <div className="relative">
                <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="name" 
                  className="pl-10 font-bold" 
                  placeholder="e.g. DumosRx Main Branch"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="location" className="text-xs font-bold uppercase tracking-wider opacity-60">City / State</Label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="location" 
                            className="pl-10 font-medium" 
                            placeholder="e.g. Lagos, NG"
                            value={formData.location}
                            onChange={(e) => setFormData({...formData, location: e.target.value})}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider opacity-60">Contact Phone</Label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                            id="phone" 
                            className="pl-10 font-medium" 
                            placeholder="+234..."
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address" className="text-xs font-bold uppercase tracking-wider opacity-60">Physical Address</Label>
              <div className="relative">
                <Home className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="address" 
                  className="pl-10 font-medium" 
                  placeholder="123 Pharmacy Way..."
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="font-bold">Cancel</Button>
              <Button type="submit" className="font-bold min-w-[140px]" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : (isEditing ? "Save Changes" : "Register Store")}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

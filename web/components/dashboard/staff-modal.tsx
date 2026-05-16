"use client";

import { useState } from "react";
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
import { Loader2, ShieldCheck, User, Mail, Lock, Store } from "lucide-react";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stores: any[];
  staffMember?: any; // If editing
}

export function StaffModal({ isOpen, onClose, onSuccess, stores, staffMember }: StaffModalProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!staffMember;

  const [formData, setFormData] = useState({
    first_name: staffMember?.first_name || "",
    last_name: staffMember?.last_name || "",
    email: staffMember?.email || "",
    username: staffMember?.username || "",
    role: staffMember?.role || "pharmacist",
    store_id: staffMember?.store_id || (stores.length > 0 ? stores[0].id : ""),
    password: "",
    pin: staffMember?.pin || "1234",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEditing) {
        await webApiClient.updateStaff(staffMember.id, formData);
        toast.success("Staff account updated successfully");
      } else {
        await webApiClient.createStaff(formData);
        toast.success("Staff account created successfully");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save staff account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">
            {isEditing ? "Edit Staff Account" : "Create New Staff"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update credentials and shop assignment for this staff member."
              : "Set up a new master or sub-account for your shops."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name" className="text-xs font-bold uppercase tracking-wider opacity-60">First Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="first_name" 
                  className="pl-10 font-medium" 
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name" className="text-xs font-bold uppercase tracking-wider opacity-60">Last Name</Label>
              <Input 
                id="last_name" 
                className="font-medium" 
                value={formData.last_name}
                onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider opacity-60">Email Address (Cloud Login)</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                id="email" 
                type="email"
                className="pl-10 font-medium" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider opacity-60">Local Username</Label>
              <Input 
                id="username" 
                className="font-medium" 
                placeholder="e.g. john_p"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin" className="text-xs font-bold uppercase tracking-wider opacity-60">Local PIN (4 digits)</Label>
              <Input 
                id="pin" 
                maxLength={4}
                className="font-black tracking-[0.5em] text-center" 
                value={formData.pin}
                onChange={(e) => setFormData({...formData, pin: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role" className="text-xs font-bold uppercase tracking-wider opacity-60">Staff Role</Label>
              <select 
                id="role"
                className="w-full bg-background border border-input h-10 px-3 rounded-md text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="pharmacist">Pharmacist</option>
                <option value="cashier">Cashier</option>
                <option value="admin">Administrator (Local Master)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="store_id" className="text-xs font-bold uppercase tracking-wider opacity-60">Assign to Shop</Label>
              <div className="relative">
                <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                <select 
                  id="store_id"
                  className="w-full bg-background border border-input h-10 pl-10 pr-3 rounded-md text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                  value={formData.store_id}
                  onChange={(e) => setFormData({...formData, store_id: e.target.value})}
                  required
                >
                  <option value="" disabled>Select a shop</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="pass" className="text-xs font-bold uppercase tracking-wider opacity-60">Cloud Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="pass" 
                  type="password"
                  className="pl-10 font-medium" 
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required={!isEditing}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="font-bold">Cancel</Button>
            <Button type="submit" className="font-bold min-w-[120px]" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEditing ? "Update Staff" : "Create Staff")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

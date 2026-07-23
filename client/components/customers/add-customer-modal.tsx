"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export function AddCustomerModal({ isOpen, onClose, onSubmit }: AddCustomerModalProps) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    
    try {
      await onSubmit(payload);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[600px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-bold">Add New Customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">First Name *</label>
              <input 
                name="first_name" 
                required
                placeholder="Jane"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Last Name</label>
              <input 
                name="last_name" 
                placeholder="Doe"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Email</label>
              <input 
                name="email" 
                type="email"
                placeholder="jane@example.com"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Phone Number</label>
              <input 
                name="phone" 
                placeholder="+234..."
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-[12px] font-medium text-foreground">Address</label>
              <input 
                name="address" 
                placeholder="123 Main St..."
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Date of Birth</label>
              <input 
                name="date_of_birth" 
                type="date"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Gender</label>
              <select 
                name="gender"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          
          <div className="pt-4 border-t space-y-4">
            <h4 className="text-[14px] font-semibold">Medical Information</h4>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Allergies (Optional)</label>
              <input 
                name="allergies" 
                placeholder="e.g. Penicillin, Peanuts"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Pre-existing Conditions (Optional)</label>
              <input 
                name="medical_conditions" 
                placeholder="e.g. Asthma, Diabetes"
                className="w-full bg-secondary/50 border-none rounded-[10px] px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 border rounded-[10px] text-[13px] font-semibold hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-[10px] text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Customer"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

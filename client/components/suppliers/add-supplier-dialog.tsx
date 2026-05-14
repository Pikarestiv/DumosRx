"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/context/store-context";
import { SearchableInput } from "@/components/ui/searchable-input";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";

interface Supplier {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  taxId: string;
  paymentTerms: string;
  isActive: boolean;
}

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSupplier: (supplier: any) => void;
}

export function AddSupplierDialog({
  open,
  onOpenChange,
  onAddSupplier,
}: AddSupplierDialogProps) {
  const { storeType } = useStore();
  const isPharmacy = storeType === 'pharmacy';
  const [formData, setFormData] = useState<Supplier>({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "Nigeria",
    taxId: "",
    paymentTerms: "",
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      alert("Please fill in the supplier name");
      return;
    }

    // Transform to snake_case for Laravel backend
    const payload = {
      name: formData.name,
      contact_person: formData.contactPerson,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      country: formData.country,
      tax_id: formData.taxId,
      payment_terms: formData.paymentTerms,
      is_active: formData.isActive,
    };

    onAddSupplier(payload);

    // Reset form
    setFormData({
      name: "",
      contactPerson: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      country: "Nigeria",
      taxId: "",
      paymentTerms: "",
      isActive: true,
    });
  };

  const handleInputChange = (
    field: keyof Supplier,
    value: string | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold">
            Add New Supplier
          </DialogTitle>
          <DialogDescription>
            Enter details for the new supplier.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Supplier Name *</Label>
            <SearchableInput
              id="name"
              value={formData.name}
              onValueChange={(val) => handleInputChange("name", val)}
              options={isPharmacy ? FORM_SUGGESTIONS.pharmacy.manufacturers : FORM_SUGGESTIONS.retail.manufacturers}
              placeholder={isPharmacy ? "e.g., Emzor Pharmaceuticals" : "e.g., Global Distributors"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact Person</Label>
            <Input
              id="contactPerson"
              value={formData.contactPerson}
              onChange={(e) =>
                handleInputChange("contactPerson", e.target.value)
              }
              placeholder="Full Name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="contact@supplier.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                placeholder="+234..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="Office Address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <SearchableInput
                id="city"
                value={formData.city}
                onValueChange={(val) => handleInputChange("city", val)}
                options={FORM_SUGGESTIONS.common.locations}
                placeholder="Select or type"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <SearchableInput
                id="state"
                value={formData.state}
                onValueChange={(val) => handleInputChange("state", val)}
                options={FORM_SUGGESTIONS.common.states}
                placeholder="Select or type"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) =>
                handleInputChange("isActive", checked)
              }
            />
            <Label htmlFor="isActive">Active Supplier</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-accent hover:bg-accent/90">
              Add Supplier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

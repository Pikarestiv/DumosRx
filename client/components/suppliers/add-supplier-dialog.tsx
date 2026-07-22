"use client";

import React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/context/store-context";
import { SearchableInput } from "@/components/ui/searchable-input";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Supplier {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  paymentTerms: string;
  isActive: boolean;
}

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSupplier: (supplier: any) => void;
  initialSupplier?: any;
}

export function AddSupplierDialog({
  open,
  onOpenChange,
  onAddSupplier,
  initialSupplier,
}: AddSupplierDialogProps) {
  const { storeType } = useStore();
  const isPharmacy = storeType === "pharmacy";
  const [formData, setFormData] = useState<Supplier>({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    taxId: initialSupplier?.taxId || "",
    paymentTerms: initialSupplier?.paymentTerms || "",
    isActive: initialSupplier ? initialSupplier.status === "active" : true,
  });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Reset form when opened with new initialSupplier
  useEffect(() => {
    if (open) {
      setFormData({
        name: initialSupplier?.name || "",
        contactPerson: initialSupplier?.contactPerson || "",
        email: initialSupplier?.email || "",
        phone: initialSupplier?.phone || "",
        address: initialSupplier?.address || "",
        taxId: initialSupplier?.taxId || "",
        paymentTerms: initialSupplier?.paymentTerms || "",
        isActive: initialSupplier ? initialSupplier.status === "active" : true,
      });
    }
  }, [open, initialSupplier]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      setAlertMessage("Please fill in the supplier name");
      return;
    }

    // Transform to snake_case for Laravel backend
    const payload = {
      name: formData.name,
      contact_person: formData.contactPerson,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
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
    <>
    <ResponsiveModal 
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-serif font-bold">{initialSupplier ? "Edit Supplier" : "Add New Supplier"}</span>}
      description={
        initialSupplier
          ? "Update the supplier's details below."
          : `Add a new ${isPharmacy ? "supplier or distributor" : "supplier"} to your database.`
      }
      className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Supplier Name *</Label>
            <SearchableInput
              id="name"
              value={formData.name}
              onValueChange={(val) => handleInputChange("name", val)}
              options={
                isPharmacy
                  ? FORM_SUGGESTIONS.store.manufacturers
                  : FORM_SUGGESTIONS.retail.manufacturers
              }
              placeholder={
                isPharmacy
                  ? "e.g., Emzor Pharmaceuticals"
                  : "e.g., Global Distributors"
              }
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
              <Label htmlFor="taxId">Tax ID (TIN)</Label>
              <Input
                id="taxId"
                value={formData.taxId}
                onChange={(e) => handleInputChange("taxId", e.target.value)}
                placeholder="Tax Identification Number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Input
                id="paymentTerms"
                type="number"
                value={formData.paymentTerms}
                onChange={(e) =>
                  handleInputChange("paymentTerms", e.target.value)
                }
                placeholder="Days (e.g., 30)"
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
              {initialSupplier ? "Save Changes" : "Add Supplier"}
            </Button>
          </DialogFooter>
        </form>
      </div>
    </ResponsiveModal>
      <ConfirmDialog
        open={!!alertMessage}
        onOpenChange={(open) => {
          if (!open) setAlertMessage(null);
        }}
        title="Validation Error"
        description={alertMessage || ""}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setAlertMessage(null)}
      />
    </>
  );
}

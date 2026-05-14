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
import { Loader2 } from "lucide-react";
import { SearchableInput } from "@/components/ui/searchable-input";

interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string;
  gender: string;
  allergies: string;
  medicalConditions: string;
  creditLimit: string;
}

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCustomer: (customer: any) => Promise<void>;
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  onAddCustomer,
}: AddCustomerDialogProps) {
  const [formData, setFormData] = useState<Customer>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    dateOfBirth: "",
    gender: "",
    allergies: "",
    medicalConditions: "",
    creditLimit: "0",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.lastName) {
      alert("Please enter first and last name");
      return;
    }

    setIsSubmitting(true);
    try {
      // Transform to snake_case for Laravel backend
      const payload = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        date_of_birth: formData.dateOfBirth ? formData.dateOfBirth : null,
        gender: formData.gender || null,
        allergies: formData.allergies
          ? formData.allergies.split(",").map((s) => s.trim())
          : null,
        medical_conditions: formData.medicalConditions || null,
        credit_limit: parseFloat(formData.creditLimit) || 0,
        outstanding_balance: 0,
      };

      await onAddCustomer(payload);

      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: "",
        dateOfBirth: "",
        gender: "",
        allergies: "",
        medicalConditions: "",
        creditLimit: "0",
      });
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof Customer, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold">
            Add New Customer
          </DialogTitle>
          <DialogDescription>Create a new customer profile.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                placeholder="First Name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                placeholder="Last Name"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="customer@email.com"
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

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="Full Address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) =>
                  handleInputChange("dateOfBirth", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <SearchableInput
                id="gender"
                value={formData.gender}
                onValueChange={(val) => handleInputChange("gender", val)}
                options={["Male", "Female", "Other"]}
                placeholder="Select or type"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allergies">Allergies (comma separated)</Label>
            <SearchableInput
              id="allergies"
              value={formData.allergies}
              onValueChange={(val) => handleInputChange("allergies", val)}
              options={["Penicillin", "Sulfa Drugs", "Peanuts", "Shellfish", "Dairy", "None"]}
              placeholder="e.g. Peanuts, Penicillin"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creditLimit">Credit Limit (₦)</Label>
            <Input
              id="creditLimit"
              type="number"
              value={formData.creditLimit === "0" ? "" : formData.creditLimit}
              onChange={(e) => handleInputChange("creditLimit", e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">Maximum debt allowed for this customer.</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 cursor-pointer"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Customer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

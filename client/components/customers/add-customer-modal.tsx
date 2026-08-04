"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import type { CustomerFormPayload } from "@/lib/types/customer";

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomerFormPayload) => Promise<void>;
}

export function AddCustomerModal({
  isOpen,
  onClose,
  onSubmit,
}: AddCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.gender = gender;
    payload.date_of_birth = dateOfBirth;

    try {
      await onSubmit(payload);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={<span className="font-serif font-bold">Add New Customer</span>}
      className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-customer-form"
            disabled={loading}
            className="bg-accent hover:bg-accent/90"
          >
            {loading ? "Saving..." : "Save Customer"}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <form
          id="add-customer-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                name="first_name"
                required
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input id="last_name" name="last_name" placeholder="Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+234..." />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" placeholder="123 Main St..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <DatePickerInput
                value={dateOfBirth}
                onChange={setDateOfBirth}
                disableFuture
                fromYear={new Date().getFullYear() - 120}
                toYear={new Date().getFullYear()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Select Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 border-t space-y-4">
            <h4 className="text-[14px] font-semibold">Medical Information</h4>
            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies (Optional)</Label>
              <Input
                id="allergies"
                name="allergies"
                placeholder="e.g. Penicillin, Peanuts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medical_conditions">
                Pre-existing Conditions (Optional)
              </Label>
              <Input
                id="medical_conditions"
                name="medical_conditions"
                placeholder="e.g. Asthma, Diabetes"
              />
            </div>
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
}

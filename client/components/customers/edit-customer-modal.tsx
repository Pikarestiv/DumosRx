"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Customer } from "@/lib/hooks/use-customer-data";

interface EditCustomerFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  date_of_birth: string;
}

interface EditCustomerModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSubmit: (data: EditCustomerFormData) => Promise<void>;
}

const emptyForm: EditCustomerFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  date_of_birth: "",
};

export function EditCustomerModal({
  customer,
  onClose,
  onSubmit,
}: EditCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<EditCustomerFormData>(emptyForm);

  useEffect(() => {
    if (customer) {
      setFormData({
        first_name: customer.firstName,
        last_name: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        date_of_birth: customer.birthday,
      });
    }
  }, [customer]);

  const handleInputChange = (
    field: keyof EditCustomerFormData,
    value: string,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal
      open={!!customer}
      onOpenChange={(open) => !open && onClose()}
      title={<span className="font-serif font-bold">Edit Customer</span>}
      description="Update the customer's details below."
      className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-customer-form"
            disabled={loading}
            className="bg-accent hover:bg-accent/90"
          >
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <form
          id="edit-customer-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) =>
                  handleInputChange("first_name", e.target.value)
                }
                placeholder="Jane"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => handleInputChange("last_name", e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
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
              placeholder="123 Main St..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <DatePickerInput
              value={formData.date_of_birth}
              onChange={(val) => handleInputChange("date_of_birth", val)}
              disableFuture
              fromYear={new Date().getFullYear() - 120}
              toYear={new Date().getFullYear()}
            />
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
}

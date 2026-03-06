"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Calendar } from "lucide-react";
import { Customer } from "@/lib/hooks/use-customer-data";

interface CustomerDetailsDialogProps {
  selectedCustomer: Customer | null;
  setSelectedCustomer: (customer: Customer | null) => void;
  getTierColor: (tier: string) => string;
}

export function CustomerDetailsDialog({
  selectedCustomer,
  setSelectedCustomer,
  getTierColor,
}: CustomerDetailsDialogProps) {
  if (!selectedCustomer) return null;

  return (
    <Dialog
      open={!!selectedCustomer}
      onOpenChange={() => setSelectedCustomer(null)}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selectedCustomer.name}</DialogTitle>
          <DialogDescription>
            Customer ID: {selectedCustomer.id}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-3">Contact Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {selectedCustomer.email}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {selectedCustomer.phone}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {selectedCustomer.address}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Birthday: {selectedCustomer.birthday}
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-3">Loyalty Information</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Tier:</span>
                  <Badge
                    className={`${getTierColor(selectedCustomer.tier)} text-white`}
                  >
                    {selectedCustomer.tier}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Points:</span>
                  <span className="font-medium">
                    {selectedCustomer.points.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Spent:</span>
                  <span className="font-medium">
                    ₦{selectedCustomer.totalSpent.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Member Since:</span>
                  <span>{selectedCustomer.joinDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Visit:</span>
                  <span>{selectedCustomer.lastVisit}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline">Edit Customer</Button>
            <Button>Send Message</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

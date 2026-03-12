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
import { Mail, Phone, MapPin, Calendar, CreditCard } from "lucide-react";
import { Customer } from "@/lib/hooks/use-customer-data";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import { RepaymentDialog } from "./repayment-dialog";
import { useState } from "react";

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
  const { storeProfile } = useStore();
  const [isRepaymentOpen, setIsRepaymentOpen] = useState(false);

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
          
          <div className="bg-muted/30 p-4 rounded-lg border border-dashed flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Financial Status</h4>
              <div className="flex items-center gap-4 mt-1">
                <div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(selectedCustomer.totalSpent, storeProfile?.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Life-time Spend</p>
                </div>
                <div className="h-8 w-px bg-border mx-2" />
                <div>
                  <p className={`text-2xl font-bold ${selectedCustomer.outstanding_balance > 0 ? "text-destructive" : "text-green-600"}`}>
                    {formatCurrency(selectedCustomer.outstanding_balance, storeProfile?.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                </div>
              </div>
            </div>
            {selectedCustomer.outstanding_balance > 0 && (
              <Button size="sm" onClick={() => setIsRepaymentOpen(true)}>
                <CreditCard className="h-4 w-4 mr-2" />
                Record Repayment
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline">Edit Customer</Button>
            <Button>Send Message</Button>
          </div>
        </div>
        
        <RepaymentDialog
          open={isRepaymentOpen}
          onOpenChange={setIsRepaymentOpen}
          customer={selectedCustomer}
          onSuccess={() => {
            // In a real app we might want to refresh the customer data here
            // but for now the user can close and re-open
            setSelectedCustomer({
              ...selectedCustomer,
              outstanding_balance: 0 // This is a placeholder, the actual data is in DB
            });
          }}
          currencyCode={storeProfile?.currency}
        />
      </DialogContent>
    </Dialog>
  );
}

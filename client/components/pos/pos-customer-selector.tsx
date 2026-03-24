"use client";

import { User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
}

interface POSCustomerSelectorProps {
  selectedCustomer: Customer | null;
  customers: Customer[];
  loadingCustomers: boolean;
  onSelectCustomer: (customer: Customer | null) => void;
}

export function POSCustomerSelector({
  selectedCustomer,
  customers,
  loadingCustomers,
  onSelectCustomer
}: POSCustomerSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <User className="h-5 w-5" />
          Customer
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedCustomer ? (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {selectedCustomer.first_name}{" "}
                  {selectedCustomer.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedCustomer.phone}
                </p>
                <p className="text-xs text-accent">
                  {selectedCustomer.loyalty_points} loyalty points
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectCustomer(null)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Select
            onValueChange={(value) => {
              const customer = customers.find((c) => c.id === value);
              if (customer) onSelectCustomer(customer);
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  loadingCustomers
                    ? "Loading..."
                    : "Select customer (optional)"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.first_name} {customer.last_name} -{" "}
                  {customer.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}

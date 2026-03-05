"use client";

import { 
  Search, 
  Plus, 
  Star, 
  Mail, 
  Phone 
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Customer } from "@/lib/hooks/use-customer-data";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";

interface CustomerDirectoryProps {
  customers: Customer[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onAddCustomer: (payload: any) => Promise<void>;
  isAddCustomerOpen: boolean;
  setIsAddCustomerOpen: (open: boolean) => void;
  onViewDetails: (customer: Customer) => void;
  getTierColor: (tier: string) => string;
  currencyCode?: string;
}

export function CustomerDirectory({
  customers,
  searchTerm,
  onSearchChange,
  onAddCustomer,
  isAddCustomerOpen,
  setIsAddCustomerOpen,
  onViewDetails,
  getTierColor,
  currencyCode
}: CustomerDirectoryProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search customers by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={() => setIsAddCustomerOpen(true)}
          className="cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
        <AddCustomerDialog
          open={isAddCustomerOpen}
          onOpenChange={setIsAddCustomerOpen}
          onAddCustomer={onAddCustomer}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Directory</CardTitle>
          <CardDescription>
            Manage customer profiles and loyalty accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No customers found. Click "Add Customer" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-gray-500">
                          {customer.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {customer.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </div>
                        )}
                        {!customer.email && !customer.phone && (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${getTierColor(customer.tier)} text-white`}
                      >
                        {customer.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {customer.points.toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={customer.outstanding_balance > 0 ? "text-destructive font-bold" : ""}>
                        {formatCurrency(customer.outstanding_balance, currencyCode)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatCurrency(customer.totalSpent, currencyCode)}
                    </TableCell>
                    <TableCell>{customer.lastVisit}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewDetails(customer)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

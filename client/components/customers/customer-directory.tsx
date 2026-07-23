"use client";

import { Search, Plus, Star, Mail, Phone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
} from "@/components/ui/card";
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
  isFuzzyFallback?: boolean;
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
  currencyCode,
  isFuzzyFallback,
}: CustomerDirectoryProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Card className="rounded-2xl border-border bg-card shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold">Customer Directory</h3>
            <p className="text-[12.5px] text-muted-foreground">Manage profiles and search history</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-[320px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 pointer-events-none" />
              <Input
                placeholder="Search by name, ID or phone..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-9 text-[13px] rounded-[10px]"
              />
            </div>
            <Button
              onClick={() => setIsAddCustomerOpen(true)}
              className="w-full sm:w-auto h-9"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>
        <AddCustomerDialog
          open={isAddCustomerOpen}
          onOpenChange={setIsAddCustomerOpen}
          onAddCustomer={onAddCustomer}
        />
        <div className="flex-1 overflow-auto">
          {isFuzzyFallback && customers.length > 0 && (
            <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-[13px] border-b border-amber-500/20 text-center font-medium">
              Did you mean? (No exact matches found. Showing closest names.)
            </div>
          )}
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
              {customers.length === 0 && (
                                          <TableRow>
                                            <TableCell colSpan={8} className="h-24 text-center">
                                              No customers found. Click "Add Customer" to create one.
                                            </TableCell>
                                          </TableRow>
                                        )}
                          {!(customers.length === 0) && (
                                          customers.map((customer) => (
                                            <TableRow key={customer.id}>
                                              <TableCell>
                                                <div>
                                                  <p className="font-medium">{customer.name}</p>
                                                  <p className="text-sm text-gray-500">{customer.id}</p>
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
                                                <span
                                                  className={
                                                    customer.outstanding_balance > 0
                                                      ? "text-destructive font-bold"
                                                      : ""
                                                  }
                                                >
                                                  {formatCurrency(
                                                    customer.outstanding_balance,
                                                    currencyCode,
                                                  )}
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
        </div>
      </Card>
    </div>
  );
}

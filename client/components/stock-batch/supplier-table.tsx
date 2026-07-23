"use client";

import { Users, Mail, Phone, MapPin, Eye, Edit } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string;
  paymentTerms: string;
  rating: number;
  hasDebt: boolean;
  debtAmount: number;
}

interface SupplierTableProps {
  suppliers: Supplier[];
  totalCount: number;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
  getRatingStars: (rating: number) => string;
  isFuzzyFallback?: boolean;
  selectedSupplierId?: string;
  onRowClick?: (supplier: Supplier) => void;
}

export function SupplierTable({
  suppliers,
  totalCount,
  formatCurrency,
  formatDate,
  getRatingStars,
  isFuzzyFallback,
  selectedSupplierId,
  onRowClick,
}: SupplierTableProps) {
  return (
    <div className="w-full">
      {isFuzzyFallback && suppliers.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4 mx-4 mt-4">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead className="w-[1.3fr] text-[11px] pl-4 font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                Supplier
              </TableHead>
              <TableHead className="w-[1fr] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                Contact
              </TableHead>
              <TableHead className="w-[90px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                Orders
              </TableHead>
              <TableHead className="w-[90px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                Rating
              </TableHead>
              <TableHead className="w-[100px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                Total Value
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Users className="h-8 w-8 mb-2 opacity-50" />
                    <p className="font-medium">No suppliers found</p>
                    <p className="text-sm">
                      Try adjusting your search or add a new supplier
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!(suppliers.length === 0) &&
              suppliers.map((supplier) => {
                const isSelected = selectedSupplierId === supplier.id;

                return (
                  <TableRow
                    key={supplier.id}
                    onClick={() => onRowClick?.(supplier)}
                    className={`border-b border-border/50 cursor-pointer transition-colors group ${
                      isSelected ? "bg-muted/60 hover:bg-muted/60" : "hover:bg-accent/50"
                    }`}
                  >
                    <TableCell className="py-[14px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                          {supplier.name[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground text-[13.5px] truncate">
                            {supplier.name}
                          </div>
                          {supplier.hasDebt && (
                            <div className="text-[11px] text-destructive font-medium mt-0.5">
                              Owed {formatCurrency(supplier.debtAmount)}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-[14px]">
                      <div className="text-muted-foreground truncate text-[12.5px]">
                        {supplier.contactPerson ||
                          supplier.email ||
                          supplier.phone}
                      </div>
                      <div className="text-muted-foreground truncate text-[11px] mt-0.5">
                        {supplier.address}
                      </div>
                    </TableCell>
                    <TableCell className="py-[14px]">
                      <div className="text-muted-foreground font-medium text-[13px]">
                        {supplier.totalOrders}
                      </div>
                    </TableCell>
                    <TableCell className="py-[14px]">
                      <div className="flex text-amber-500 text-[13px] tracking-widest">
                        {getRatingStars(supplier.rating)}
                      </div>
                    </TableCell>
                    <TableCell className="py-[14px]">
                      <div className="font-semibold text-foreground text-[13px]">
                        {formatCurrency(supplier.totalValue)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

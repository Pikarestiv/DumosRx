"use client";

import { 
  Users, 
  Mail, 
  Phone, 
  MapPin, 
  Eye, 
  Edit 
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

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string;
  paymentTerms: string;
  rating: number;
}

interface SupplierTableProps {
  suppliers: Supplier[];
  totalCount: number;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
  getStatusBadge: (status: "active" | "inactive") => React.ReactNode;
  getRatingStars: (rating: number) => string;
  isFuzzyFallback?: boolean;
}

export function SupplierTable({
  suppliers,
  totalCount,
  formatCurrency,
  formatDate,
  getStatusBadge,
  getRatingStars,
  isFuzzyFallback
}: SupplierTableProps) {
  return (
    <div className="w-full">
      {isFuzzyFallback && suppliers.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead className="w-[1.3fr] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">Supplier</TableHead>
              <TableHead className="w-[1fr] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">Contact</TableHead>
              <TableHead className="w-[100px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">Status</TableHead>
              <TableHead className="w-[90px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">Orders</TableHead>
              <TableHead className="w-[90px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">Rating</TableHead>
              <TableHead className="w-[120px] text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">Total Value</TableHead>
              <TableHead className="w-[80px] text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
              {suppliers.length === 0 && (
                                          <TableRow>
                                            <TableCell colSpan={9} className="h-32 text-center">
                                              <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Users className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="font-medium">No suppliers found</p>
                                                <p className="text-sm">Try adjusting your search or add a new supplier</p>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )}
              {!(suppliers.length === 0) && (
                suppliers.map((supplier) => {
                  const hasDebt = parseInt(supplier.id, 16) % 2 === 0; // Mock debt condition
                  return (
                    <TableRow key={supplier.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors group">
                      <TableCell className="py-[14px]">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                            {supplier.name[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-[13.5px] truncate">{supplier.name}</div>
                            {hasDebt && (
                              <div className="text-[11px] text-destructive font-medium mt-0.5">Owes ₦1,250,000</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-[14px]">
                        <div className="text-muted-foreground truncate text-[12.5px]">{supplier.contactPerson || supplier.email || supplier.phone}</div>
                        <div className="text-muted-foreground truncate text-[11px] mt-0.5">{supplier.city}, {supplier.state}</div>
                      </TableCell>
                      <TableCell className="py-[14px]">
                        {getStatusBadge(supplier.status)}
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
                      <TableCell className="text-right py-[14px]">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
  );
}

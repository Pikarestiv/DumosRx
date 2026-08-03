import React from "react";
import { Search, Scan } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { POSCustomerSelector } from "./pos-customer-selector";
import { Customer } from "@/lib/hooks/use-pos-data";

interface POSMobileSearchProps {
  selectedCustomer: Customer | null;
  customers: Customer[];
  loadingCustomers: boolean;
  onSelectCustomer: (customer: Customer | null) => void;
  cartLength: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setIsMobileScannerOpen: (open: boolean) => void;
}

export function POSMobileSearch({
  selectedCustomer,
  customers,
  loadingCustomers,
  onSelectCustomer,
  cartLength,
  searchTerm,
  setSearchTerm,
  handleKeyPress,
  setIsMobileScannerOpen,
}: POSMobileSearchProps) {
  return (
    <div className="flex flex-col gap-4 lg:hidden mb-2 shrink-0">
      <POSCustomerSelector
        selectedCustomer={selectedCustomer}
        customers={customers}
        loadingCustomers={loadingCustomers}
        onSelectCustomer={onSelectCustomer}
        cartLength={cartLength}
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <Input
            type="text"
            placeholder="Search products or SKU"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyPress}
            className="h-10 pl-10 pr-10 bg-muted/30 border-border/50 rounded-xl text-sm w-full"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center"
            >
              <span className="sr-only">Clear</span>
              <span aria-hidden="true" className="text-lg font-bold leading-none">&times;</span>
            </button>
          )}
        </div>
        <Button
          variant="default"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-10 w-10 p-0 shrink-0 flex items-center justify-center"
          onClick={() => setIsMobileScannerOpen(true)}
        >
          <Scan className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

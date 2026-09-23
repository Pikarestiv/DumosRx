import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { FilterPill } from "@/components/ui/filter-pill";

interface TransactionFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  dateRange: DateRangeValue;
  setDateRange: (range: DateRangeValue) => void;
  paymentFilter: string;
  setPaymentFilter: (filter: string) => void;
  saleTypeFilter: string;
  setSaleTypeFilter: (filter: string) => void;
}

const PAYMENT_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "Card", label: "Card" },
  { value: "Transfer", label: "Transfer" },
];

const SALE_TYPE_OPTIONS = [{ value: "Reseller", label: "Reseller" }];

export function TransactionFilters({
  searchQuery,
  setSearchQuery,
  dateRange,
  setDateRange,
  paymentFilter,
  setPaymentFilter,
  saleTypeFilter,
  setSaleTypeFilter,
}: TransactionFiltersProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search receipt, customer, or item"
          className="pl-9 h-12 rounded-xl bg-card border-border/50"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        {dateRange.from && (
          <button
            type="button"
            onClick={() => setDateRange({})}
            className="text-[11.5px] text-muted-foreground hover:text-foreground underline px-0.5"
          >
            Clear date range
          </button>
        )}
        <FilterPill
          label="Payment"
          value={paymentFilter}
          onValueChange={setPaymentFilter}
          options={PAYMENT_OPTIONS}
          allValue="All"
        />
        <FilterPill
          label="Sale Type"
          value={saleTypeFilter}
          onValueChange={setSaleTypeFilter}
          options={SALE_TYPE_OPTIONS}
          allValue="All"
        />
      </div>
    </div>
  );
}

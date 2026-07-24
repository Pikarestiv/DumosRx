import React from 'react';
import { Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TransactionFilters({
  searchQuery,
  setSearchQuery,
  dateFilter,
  setDateFilter,
  paymentFilter,
  setPaymentFilter,
}: any) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search receipt or customer"
            className="pl-9 h-12 rounded-xl bg-background border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-12 w-12 rounded-xl border-border/50 shrink-0"
        >
          <Filter className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar flex-nowrap md:flex-wrap">
        <FilterPill
          label="All"
          current={dateFilter}
          onClick={() => setDateFilter("All")}
        />
        <FilterPill
          label="Today"
          current={dateFilter}
          onClick={() =>
            setDateFilter(dateFilter === "Today" ? "All" : "Today")
          }
        />
        <FilterPill
          label="This week"
          current={dateFilter}
          onClick={() =>
            setDateFilter(dateFilter === "This week" ? "All" : "This week")
          }
        />

        <FilterPill
          label="Cash"
          current={paymentFilter}
          onClick={() =>
            setPaymentFilter(paymentFilter === "Cash" ? "All" : "Cash")
          }
        />
        <FilterPill
          label="Card"
          current={paymentFilter}
          onClick={() =>
            setPaymentFilter(paymentFilter === "Card" ? "All" : "Card")
          }
        />
        <FilterPill
          label="Transfer"
          current={paymentFilter}
          onClick={() =>
            setPaymentFilter(paymentFilter === "Transfer" ? "All" : "Transfer")
          }
        />
      </div>
    </div>
  );
}

function FilterPill({
  label,
  current,
  onClick,
}: {
  label: string;
  current: string;
  onClick: () => void;
}) {
  const isActive = current === label;
  return (
    <Button
      variant={isActive ? "default" : "outline"}
      onClick={onClick}
      className={`rounded-full h-9 px-5 shrink-0 transition-colors ${isActive ? "bg-primary hover:bg-primary/90 text-primary-foreground border-0" : "bg-background border-border/50 text-foreground hover:bg-muted/50 hover:text-foreground"}`}
    >
      {label}
    </Button>
  );
}

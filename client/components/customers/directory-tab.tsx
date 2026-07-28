"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Customer } from "@/lib/hooks/use-customer-data";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/utils";
import { CustomerDetailPanel } from "./customer-detail-panel";
import { CustomerMobileRow, CustomerDesktopRow } from "./customer-list-rows";

// Matches the row's px-4 py-2.5 padding + single line of 13.5px/12px text.
const DESKTOP_ROW_HEIGHT = 56;

interface DirectoryTabProps {
  customers: Customer[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  getTierColor: (tier: string) => string;
  currencyCode?: string;
  onViewHistory?: (customer: Customer) => void;
  onEditProfile?: (customer: Customer) => void;
  onRecordPayment?: (customer: Customer) => void;
}

type CustFilter = "all" | "debt" | "loyalty";

function NoCustomersFound() {
  return (
    <div className="p-8 flex flex-col items-center gap-2 text-center text-muted-foreground text-[13px]">
      <Users className="w-7 h-7 opacity-30" />
      No customers found.
    </div>
  );
}

export function DirectoryTab({
  customers,
  searchTerm,
  onSearchChange,
  selectedCustomer,
  setSelectedCustomer,
  getTierColor,
  currencyCode = "NGN",
  onViewHistory,
  onEditProfile,
  onRecordPayment,
}: DirectoryTabProps) {
  const [filter, setFilter] = useState<CustFilter>("all");

  const desktopScrollRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredCustomers = useMemo(() => {
    if (filter === "debt") return customers.filter((c) => c.outstanding_balance > 0);
    if (filter === "loyalty") return customers.filter((c) => c.points > 0);
    return customers;
  }, [customers, filter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredCustomers.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => DESKTOP_ROW_HEIGHT,
    overscan: 8,
  });

  const debtSummary = useMemo(() => {
    const debtors = customers.filter((c) => c.outstanding_balance > 0);
    const total = debtors.reduce((acc, c) => acc + c.outstanding_balance, 0);
    return { count: debtors.length, total };
  }, [customers]);

  const filterChips: { key: CustFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "debt", label: "Has debt" },
    { key: "loyalty", label: "Loyalty members" },
  ];

  const FilterChips = (
    <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {filterChips.map((c) => (
        <button
          key={c.key}
          onClick={() => setFilter(c.key)}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
            filter === c.key
              ? "bg-primary text-primary-foreground"
              : "border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  const DebtSummary = debtSummary.count > 0 && (
    <div className="text-[11.5px] text-destructive font-medium whitespace-nowrap">
      {formatCurrency(debtSummary.total, currencyCode)} outstanding across{" "}
      {debtSummary.count} customer{debtSummary.count === 1 ? "" : "s"}
    </div>
  );

  const SearchInput = (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search customers by name, email, or phone"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full bg-card border border-border md:bg-muted md:border-none rounded-[10px] pl-9 pr-4 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
      />
    </div>
  );

  const renderDetailBody = (customer: Customer) => (
    <CustomerDetailPanel
      customer={customer}
      currencyCode={currencyCode}
      getTierColor={getTierColor}
      onBack={() => setSelectedCustomer(null)}
      onViewHistory={onViewHistory}
      onEditProfile={onEditProfile}
      onRecordPayment={onRecordPayment}
    />
  );

  return (
    <div className="flex flex-col md:flex-row h-full gap-4 relative">
      {/* Mobile List — flat, no wrapping card */}
      <div className="flex md:hidden flex-col w-full gap-4">
        {SearchInput}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {FilterChips}
        </div>
        {DebtSummary}

        <div className="flex flex-col gap-2">
          {filteredCustomers.map((customer) => (
            <CustomerMobileRow
              key={customer.id}
              customer={customer}
              isSelected={selectedCustomer?.id === customer.id}
              onSelect={setSelectedCustomer}
              getTierColor={getTierColor}
            />
          ))}
          {filteredCustomers.length === 0 && <NoCustomersFound />}
        </div>
      </div>

      {/* Desktop List Panel */}
      <Card className="hidden md:flex flex-col gap-0 py-0 border rounded-[14px] shadow-sm w-full flex-1 min-h-0 h-full overflow-hidden">
        <div className="p-4 border-b space-y-3">
          {SearchInput}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {FilterChips}
            {DebtSummary}
          </div>
        </div>

        {/* Desktop table header */}
        <div className="hidden md:grid grid-cols-[1.6fr_1.1fr_80px_70px_100px_110px] gap-2 px-4 py-2 text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide border-b">
          <div>Customer</div>
          <div>Contact</div>
          <div>Tier</div>
          <div className="text-right">Points</div>
          <div className="text-right">Balance</div>
          <div className="text-right">Last Visit</div>
        </div>

        <div ref={desktopScrollRef} className="overflow-y-auto flex-1">
          {filteredCustomers.length > 0 && (
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const customer = filteredCustomers[virtualRow.index];
                return (
                  <CustomerDesktopRow
                    key={customer.id}
                    customer={customer}
                    isSelected={selectedCustomer?.id === customer.id}
                    onSelect={setSelectedCustomer}
                    getTierColor={getTierColor}
                    currencyCode={currencyCode}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  />
                );
              })}
            </div>
          )}
          {filteredCustomers.length === 0 && <NoCustomersFound />}
        </div>
      </Card>

      {/* Desktop Detail Panel */}
      <Card
        className={`hidden md:flex flex-col gap-0 py-0 border rounded-[14px] shadow-sm w-full md:w-[380px] md:flex-shrink-0 ${!selectedCustomer ? "items-center justify-center py-5" : ""}`}
      >
        {!selectedCustomer ? (
          <div className="text-center text-muted-foreground">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-[14px]">Select a customer to view details</p>
          </div>
        ) : (
          renderDetailBody(selectedCustomer)
        )}
      </Card>

      {/* Mobile Detail Panel (Sheet, full-screen push) */}
      <Sheet
        open={!!selectedCustomer && isMobile}
        onOpenChange={(open) => {
          if (!open) setSelectedCustomer(null);
        }}
      >
        <SheetContent
          side="right"
          hideClose
          className="w-full sm:w-[400px] p-0 flex flex-col bg-card"
        >
          {selectedCustomer && renderDetailBody(selectedCustomer)}
        </SheetContent>
      </Sheet>
    </div>
  );
}

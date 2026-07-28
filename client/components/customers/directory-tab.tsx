"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Customer } from "@/lib/hooks/use-customer-data";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/utils";

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

  const renderDetailBody = (customer: Customer) => {
    const detailFields = [
      { label: "Phone", value: customer.phone || "Not provided" },
      { label: "Address", value: customer.address || "Not provided" },
      { label: "Date of Birth", value: customer.birthday || "Not provided" },
      { label: "Joined", value: customer.joinDate },
      {
        label: "Total Spent",
        value: formatCurrency(customer.totalSpent, currencyCode),
      },
      {
        label: "Loyalty Points",
        value: `${customer.points.toLocaleString()} pts`,
        valueClassName: "text-emerald-600",
      },
      { label: "Last Visit", value: customer.lastVisit },
    ];

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 md:p-5 border-b flex items-center gap-3">
          <button
            className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setSelectedCustomer(null)}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[18px]">
            {customer.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold truncate">
              {customer.name}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">
              {customer.email || "No email provided"}
            </div>
          </div>
          <span
            className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-md shrink-0 text-white ${getTierColor(customer.tier)}`}
          >
            {customer.tier}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {customer.outstanding_balance > 0 && (
            <div className="border border-destructive/20 bg-destructive/5 rounded-[12px] p-4 mb-5">
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="text-[11px] font-semibold text-destructive uppercase tracking-wide flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Outstanding balance
                </div>
                <div className="text-[13px] font-bold text-destructive whitespace-nowrap">
                  {formatCurrency(customer.outstanding_balance, currencyCode)}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onRecordPayment?.(customer)}
                  className="flex-1 bg-destructive text-destructive-foreground py-2 rounded-[8px] text-[12.5px] font-semibold hover:bg-destructive/90 transition-colors"
                >
                  Record Payment
                </button>
                {/* Send Reminder: disabled until an SMS/email service is wired up */}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {detailFields.map((field) => (
              <div key={field.label}>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  {field.label}
                </div>
                <div
                  className={`text-[13.5px] font-medium ${field.valueClassName || ""}`}
                >
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-5 pt-4 border-t flex gap-2.5">
          <button
            onClick={() => onEditProfile?.(customer)}
            className="flex-1 border bg-background text-foreground py-2.5 rounded-xl text-[13px] font-semibold hover:bg-primary/5 transition-colors"
          >
            Edit Profile
          </button>
          <button
            onClick={() => onViewHistory?.(customer)}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl text-[13px] font-semibold hover:bg-primary/90 transition-colors"
          >
            View History
          </button>
        </div>
      </div>
    );
  };

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
          {filteredCustomers.map((customer) => {
            const isSelected = selectedCustomer?.id === customer.id;
            return (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-primary/5"}`}
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px]">
                  {customer.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">
                    {customer.name}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {customer.phone || customer.email || "No contact info"}
                  </div>
                </div>
                <div
                  className={`shrink-0 text-[10px] font-medium px-2 py-1 rounded-full text-white ${getTierColor(customer.tier)}`}
                >
                  {customer.tier}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
          {filteredCustomers.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-[13px]">
              No customers found.
            </div>
          )}
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
                const isSelected = selectedCustomer?.id === customer.id;
                return (
                  <div
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    className={`absolute top-0 left-0 w-full grid grid-cols-[1.6fr_1.1fr_80px_70px_100px_110px] items-center gap-2 px-4 py-2.5 cursor-pointer border-b transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-primary/5"}`}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px]">
                        {customer.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold truncate">
                          {customer.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-[12px] text-muted-foreground truncate">
                      {customer.phone || customer.email || "No contact info"}
                    </div>
                    <div>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full text-white ${getTierColor(customer.tier)}`}
                      >
                        {customer.tier}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-right text-emerald-600 font-medium">
                      {customer.points.toLocaleString()}
                    </div>
                    <div
                      className={`text-[12.5px] text-right font-medium ${customer.outstanding_balance > 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {customer.outstanding_balance > 0
                        ? formatCurrency(customer.outstanding_balance, currencyCode)
                        : "-"}
                    </div>
                    <div className="text-[12px] text-right text-muted-foreground">
                      {customer.lastVisit}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {filteredCustomers.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-[13px]">
              No customers found.
            </div>
          )}
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

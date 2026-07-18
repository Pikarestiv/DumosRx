"use client";

import React, { useState, useMemo } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import {
  Receipt,
  RotateCcw,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Search,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/context/auth-context";
import { TransactionDetailsDialog } from "./transaction-details-dialog";

// ============================================================================
// Types
// ============================================================================

interface POSTransactionHistoryProps {
  recentSales: any[];
  onReturnClick: (sale: any) => void;
  currencyCode?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function POSTransactionHistory({
  recentSales,
  onReturnClick,
  currencyCode,
}: POSTransactionHistoryProps) {
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("All");
  const [paymentFilter, setPaymentFilter] = useState<string>("All");

  const { user } = useAuth();
  const canReturn =
    user?.role === "store_owner" ||
    user?.role === "admin" ||
    user?.role === "manager";

  // Compute metrics for "Today"
  const todayMetrics = useMemo(() => {
    const todaySales = (recentSales || []).filter(
      (s) => s.created_at && isToday(parseISO(s.created_at)),
    );

    const totalSales = todaySales.reduce(
      (acc, s) => acc + (Number(s.total_amount) || Number(s.total) || 0),
      0,
    );
    const transactions = todaySales.length;
    const refunded = todaySales.filter(
      (s) =>
        s.payment_status?.toLowerCase() === "refunded" ||
        s.status?.toLowerCase() === "refunded",
    ).length;
    const avgBasket = transactions > 0 ? totalSales / transactions : 0;

    return { totalSales, transactions, refunded, avgBasket };
  }, [recentSales]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return (recentSales || []).filter((sale) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesCustomer = (sale.customer_name || "Walk-in")
          .toLowerCase()
          .includes(q);
        const matchesReceipt = sale.transaction_number
          ?.toLowerCase()
          .includes(q);
        if (!matchesCustomer && !matchesReceipt) return false;
      }

      if (dateFilter === "Today") {
        if (!sale.created_at || !isToday(parseISO(sale.created_at)))
          return false;
      } else if (dateFilter === "This week") {
        if (!sale.created_at) return false;
        const diff = Date.now() - new Date(sale.created_at).getTime();
        if (diff > 7 * 24 * 60 * 60 * 1000) return false;
      }

      if (paymentFilter !== "All") {
        if (sale.payment_method?.toLowerCase() !== paymentFilter.toLowerCase())
          return false;
      }

      return true;
    });
  }, [recentSales, searchQuery, dateFilter, paymentFilter]);

  // Group by relative date
  const groupedSales = useMemo(() => {
    const groups: { [key: string]: any[] } = {
      TODAY: [],
      YESTERDAY: [],
      "THIS WEEK": [],
      OLDER: [],
    };

    filteredSales.forEach((sale) => {
      if (!sale.created_at) {
        groups["OLDER"].push(sale);
        return;
      }
      const d = parseISO(sale.created_at);
      if (isToday(d)) {
        groups["TODAY"].push(sale);
      } else if (isYesterday(d)) {
        groups["YESTERDAY"].push(sale);
      } else {
        const diff = Date.now() - d.getTime();
        if (diff <= 7 * 24 * 60 * 60 * 1000) {
          groups["THIS WEEK"].push(sale);
        } else {
          groups["OLDER"].push(sale);
        }
      }
    });

    return groups;
  }, [filteredSales]);

  return (
    <div className="flex flex-col gap-6">
      <TransactionMetrics metrics={todayMetrics} currencyCode={currencyCode} />

      <TransactionFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
      />

      <TransactionList
        groupedSales={groupedSales}
        currencyCode={currencyCode}
        canReturn={canReturn}
        onSelectSale={setSelectedSale}
        onReturnClick={onReturnClick}
        hasFilters={filteredSales.length === 0}
      />

      <TransactionDetailsDialog
        sale={selectedSale}
        open={!!selectedSale}
        onOpenChange={(open) => !open && setSelectedSale(null)}
        currencyCode={currencyCode}
        onReturnClick={canReturn ? onReturnClick : undefined}
      />
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function TransactionMetrics({
  metrics,
  currencyCode,
}: {
  metrics: any;
  currencyCode?: string;
}) {
  return (
    <div className="flex overflow-x-auto gap-4 pb-2 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 hide-scrollbar snap-x snap-mandatory">
      <MetricCard
        title="Today's sales"
        value={formatCurrency(metrics.totalSales, currencyCode)}
      />
      <MetricCard title="Transactions" value={metrics.transactions} />
      <MetricCard title="Refunded" value={metrics.refunded} />
      <MetricCard
        title="Avg. basket"
        value={formatCurrency(metrics.avgBasket, currencyCode)}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground p-3 shadow-sm border border-border/50 min-w-[130px] shrink-0 md:min-w-0 rounded-xl flex flex-col justify-center snap-start">
      <p className="text-sm text-muted-foreground font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold font-serif">{value}</p>
    </div>
  );
}

function TransactionFilters({
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

function TransactionList({
  groupedSales,
  currencyCode,
  canReturn,
  onSelectSale,
  onReturnClick,
  hasFilters,
}: any) {
  if (hasFilters) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-xl border-dashed">
        No recent sales found
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {Object.entries(groupedSales).map(([groupName, sales]: [string, any]) => {
        if (sales.length === 0) return null;
        return (
          <div key={groupName} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase pl-1">
              {groupName}
            </h3>
            <div className="flex flex-col gap-3">
              {sales.map((sale: any) => (
                <TransactionItem
                  key={sale.id}
                  sale={sale}
                  currencyCode={currencyCode}
                  canReturn={canReturn}
                  onClick={() => onSelectSale(sale)}
                  onReturnClick={onReturnClick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TransactionItem({
  sale,
  currencyCode,
  canReturn,
  onClick,
  onReturnClick,
}: any) {
  const time = sale.created_at
    ? format(parseISO(sale.created_at), "h:mm a")
    : "";
  const itemCount = sale.item_count || 1;
  const amount = Number(sale.total_amount) || Number(sale.total) || 0;

  const getPaymentIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case "cash":
        return <Banknote className="h-5 w-5 text-emerald-600" />;
      case "card":
        return <CreditCard className="h-5 w-5 text-blue-600" />;
      case "transfer":
        return <ArrowLeftRight className="h-5 w-5 text-purple-600" />;
      default:
        return <Receipt className="h-5 w-5 text-gray-600" />;
    }
  };

  const getPaymentIconBg = (method: string) => {
    switch (method?.toLowerCase()) {
      case "cash":
        return "bg-emerald-100";
      case "card":
        return "bg-blue-100";
      case "transfer":
        return "bg-purple-100";
      default:
        return "bg-gray-100";
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || "completed";
    if (s === "completed")
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80 border-0"
        >
          Completed
        </Badge>
      );
    if (s === "refunded")
      return (
        <Badge
          variant="secondary"
          className="bg-red-100 text-red-700 hover:bg-red-100/80 border-0"
        >
          Refunded
        </Badge>
      );
    if (s === "resumed hold")
      return (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-700 hover:bg-amber-100/80 border-0"
        >
          Resumed hold
        </Badge>
      );
    return (
      <Badge
        variant="secondary"
        className="bg-gray-100 text-gray-700 hover:bg-gray-100/80 border-0 capitalize"
      >
        {s}
      </Badge>
    );
  };

  return (
    <div
      className="bg-card text-card-foreground p-3 rounded-2xl shadow-sm border border-border/50 cursor-pointer hover:border-primary/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between group gap-3 sm:gap-0"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 w-full">
        <div
          className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${getPaymentIconBg(sale.payment_method)}`}
        >
          {getPaymentIcon(sale.payment_method)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[15px] text-foreground mb-0.5 truncate">
            Sale #{sale.transaction_number} &middot;{" "}
            {sale.customer_name || "Walk-in"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {time && `${time} · `}
            {itemCount} item{itemCount !== 1 ? "s" : ""} &middot;{" "}
            <span className="capitalize">
              {sale.payment_method || "Unknown"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end w-full sm:w-auto gap-4">
        {canReturn && (
          <Button
            variant="ghost"
            size="sm"
            className="text-accent opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex"
            onClick={(e) => {
              e.stopPropagation();
              onReturnClick(sale);
            }}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Return
          </Button>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <div className="font-bold font-serif text-[15px]">
            {formatCurrency(amount, currencyCode)}
          </div>
          {getStatusBadge(sale.payment_status)}
        </div>
      </div>
    </div>
  );
}

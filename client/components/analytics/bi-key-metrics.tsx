"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, Package, Users, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BIKeyMetricsProps {
  totalRevenue: number;
  totalTransactions: number;
  stock_batchValue: number;
  activeCustomers: number;
  netProfit: number;
}

export function BIKeyMetrics({
  totalRevenue,
  totalTransactions,
  stock_batchValue,
  activeCustomers,
  netProfit,
}: BIKeyMetricsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-primary/5 border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <div className="flex items-center text-[11px] sm:text-xs text-muted-foreground">Gross billings</div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 bg-emerald-500/5 border-emerald-500/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-emerald-600">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-emerald-600">{formatCurrency(netProfit)}</div>
            <div className="flex items-center text-[11px] sm:text-xs text-muted-foreground">After COGS & Expenses</div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Transactions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{totalTransactions.toLocaleString()}</div>
            <div className="flex items-center text-[11px] sm:text-xs text-muted-foreground">Volume</div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Stock Batch Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{formatCurrency(stock_batchValue)}</div>
            <div className="flex items-center text-[11px] sm:text-xs text-muted-foreground">Asset value (Cost)</div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{activeCustomers.toLocaleString()}</div>
            <div className="flex items-center text-[11px] sm:text-xs text-muted-foreground">Active base</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

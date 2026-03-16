"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, Package, Users, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BIKeyMetricsProps {
  totalRevenue: number;
  totalTransactions: number;
  inventoryValue: number;
  activeCustomers: number;
  netProfit: number;
}

export function BIKeyMetrics({
  totalRevenue,
  totalTransactions,
  inventoryValue,
  activeCustomers,
  netProfit,
}: BIKeyMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card className="bg-primary/5 border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
          <div className="flex items-center text-xs text-muted-foreground">Gross billings</div>
        </CardContent>
      </Card>

      <Card className="bg-emerald-500/5 border-emerald-500/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-emerald-600">Net Profit</CardTitle>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">{formatCurrency(netProfit)}</div>
          <div className="flex items-center text-xs text-muted-foreground">After COGS & Expenses</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTransactions.toLocaleString()}</div>
          <div className="flex items-center text-xs text-muted-foreground">Volume</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(inventoryValue)}</div>
          <div className="flex items-center text-xs text-muted-foreground">Asset value (Cost)</div>
        </CardContent>
      </Card>

      <Card className="hidden lg:block">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Customers</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{activeCustomers.toLocaleString()}</div>
          <div className="flex items-center text-xs text-muted-foreground">Active base</div>
        </CardContent>
      </Card>
    </div>
  );
}

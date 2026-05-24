"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown,
  Clock
} from "lucide-react";
import { useStore } from "@/lib/context/store-context";

interface CustomerBehaviorTabProps {
  customerMetrics: {
    metric: string;
    value: string;
    change: string;
    trend: string;
  }[];
  purchasePatterns?: {
    slot: string;
    transactions: number;
    avgValue: number;
    topCategory: string;
  }[];
}

export function CustomerBehaviorTab({
  customerMetrics,
  purchasePatterns = [],
}: CustomerBehaviorTabProps) {
  const { storeProfile } = useStore();
  const currency = storeProfile?.currency || "NGN";
  const symbol = currency === "NGN" ? "₦" : currency === "USD" ? "$" : currency === "GBP" ? "£" : "₦";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {customerMetrics.map((metric) => (
          <Card key={metric.metric}>
            <CardHeader className="pb-2">
              <CardDescription>{metric.metric}</CardDescription>
              <CardTitle className="text-2xl">{metric.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                {metric.trend === "up" ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={`text-sm font-medium ${
                    metric.trend === "up"
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {metric.change}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  vs last period
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Customer Purchase Patterns
          </CardTitle>
          <CardDescription>
            Peak hours and transaction frequency based on real sales data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {purchasePatterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 opacity-20 mb-3" />
              <p className="font-semibold">No transaction data available</p>
              <p className="text-sm mt-1">Sales will appear here once transactions are recorded.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time Period</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Avg. Value</TableHead>
                  <TableHead>Top Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasePatterns.map((row) => (
                  <TableRow key={row.slot}>
                    <TableCell className="font-medium">{row.slot}</TableCell>
                    <TableCell>{row.transactions.toLocaleString()}</TableCell>
                    <TableCell>
                      {symbol}{Math.round(row.avgValue).toLocaleString()}
                    </TableCell>
                    <TableCell>{row.topCategory}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

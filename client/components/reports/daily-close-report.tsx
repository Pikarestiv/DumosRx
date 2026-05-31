"use client";

import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  FileText,
  CheckCircle2,
  Download,
  Printer,
} from "lucide-react";
import { getLocalTodayDate } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DailyCloseReport() {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;

  // 1. Fetch sales for today
  const { data: salesToday } = useLocalData<any>(
    `SELECT * FROM sales WHERE date(transaction_date) = '${getLocalTodayDate()}' AND _deleted = 0`,
  );

  // 2. Fetch sale items for today to calculate profit and top sellers
  const { data: itemsToday } = useLocalData<any>(
    `SELECT si.*, m.name as medicine_name, m.cost_price as med_cost_price 
     FROM sale_items si 
     JOIN sales s ON si.sale_id = s.id 
     LEFT JOIN medicines m ON si.medicine_id = m.id 
     WHERE date(s.transaction_date) = '${getLocalTodayDate()}' AND si._deleted = 0 AND s._deleted = 0`,
  );

  // Parse Mixed payments by joining with customer_payments if needed, but we can rely on `payment_splits` which is stored as JSON in `payment_details` if we modified it?
  // Actually, POSPaymentDialog saves `paymentMethod` and potentially splits. Let's aggregate based on `payment_method`.
  const aggregatedTotals = {
    cash: 0,
    card: 0,
    transfer: 0,
    credit: 0,
    total: 0,
  };

  salesToday.forEach((sale: any) => {
    aggregatedTotals.total += sale.total_amount;
    const method = sale.payment_method?.toLowerCase();

    if (method === "mixed" && sale.payment_details) {
      try {
        const details = JSON.parse(sale.payment_details);
        if (details.splits && Array.isArray(details.splits)) {
          details.splits.forEach((split: any) => {
            const splitMethod = split.method?.toLowerCase();
            if (
              aggregatedTotals[splitMethod as keyof typeof aggregatedTotals] !==
              undefined
            ) {
              aggregatedTotals[splitMethod as keyof typeof aggregatedTotals] +=
                split.amount;
            }
          });
        }
      } catch (e) {
        console.error("Error parsing mixed payment details", e);
      }
    } else if (
      aggregatedTotals[method as keyof typeof aggregatedTotals] !== undefined
    ) {
      aggregatedTotals[method as keyof typeof aggregatedTotals] +=
        sale.total_amount;
    } else if (method === "mobile") {
      aggregatedTotals.transfer += sale.total_amount;
    }
  });

  // Calculate top sellers & profit
  let totalCostPrice = 0;
  let totalRevenue = 0;
  const itemMap: Record<
    string,
    { name: string; quantity: number; revenue: number }
  > = {};

  itemsToday.forEach((item: any) => {
    const cost = item.cost_price || item.med_cost_price || 0;
    totalCostPrice += cost * item.quantity;
    totalRevenue += item.total_price || 0;

    if (!itemMap[item.medicine_id]) {
      itemMap[item.medicine_id] = {
        name: item.medicine_name || "Unknown",
        quantity: 0,
        revenue: 0,
      };
    }
    itemMap[item.medicine_id].quantity += item.quantity;
    itemMap[item.medicine_id].revenue += item.total_price;
  });

  const totalProfit = aggregatedTotals.total - totalCostPrice;
  const topSellingMeds = Object.values(itemMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const exportToCSV = () => {
    const csvContent = [
      ["Daily Close Report", `Generated: ${new Date().toLocaleDateString()}`],
      ["Total Sales", aggregatedTotals.total.toString()],
      ["Cash Expected", aggregatedTotals.cash.toString()],
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ["Total Profit (Est.)", totalProfit.toString()],
      [],
      ["Payment Breakdown"],
      ["Method", "Amount"],
      ["Cash", aggregatedTotals.cash.toString()],
      ["Card / POS", aggregatedTotals.card.toString()],
      ["Transfer / Mobile", aggregatedTotals.transfer.toString()],
      ["Credit Sales", aggregatedTotals.credit.toString()],
      [],
      ["Highest Selling Medicines"],
      ["Medicine", "Qty Sold", "Revenue"],
      ...topSellingMeds.map((med) => [
        med.name,
        med.quantity.toString(),
        med.revenue.toString(),
      ]),
    ]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Daily_Close_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <AlertTitle>Daily Close Ready</AlertTitle>
        <AlertDescription>
          This report aggregates all transactions made today. Use this for end
          of day reconciliation.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(aggregatedTotals.total, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cash Expected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(aggregatedTotals.cash, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transfer / Mobile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(aggregatedTotals.transfer, currencyCode)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Profit (Est.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatCurrency(totalProfit, currencyCode)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Payment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium text-muted-foreground">Cash</span>
                <span className="font-bold">
                  {formatCurrency(aggregatedTotals.cash, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium text-muted-foreground">
                  Card / POS
                </span>
                <span className="font-bold">
                  {formatCurrency(aggregatedTotals.card, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium text-muted-foreground">
                  Transfer / Mobile
                </span>
                <span className="font-bold">
                  {formatCurrency(aggregatedTotals.transfer, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="font-medium text-muted-foreground">
                  Credit Sales
                </span>
                <span className="font-bold">
                  {formatCurrency(aggregatedTotals.credit, currencyCode)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">
              Highest Selling Medicines
            </CardTitle>
            <CardDescription>By quantity sold today</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSellingMeds.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground py-4"
                    >
                      No items sold today.
                    </TableCell>
                  </TableRow>
                ) : (
                  topSellingMeds.map((med, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{med.name}</TableCell>
                      <TableCell className="text-right">
                        {med.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(med.revenue, currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportToCSV} className="cursor-pointer">
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.print()}
              className="cursor-pointer"
            >
              Export PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

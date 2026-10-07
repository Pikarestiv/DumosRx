import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import { CurrencyStatValue } from "@/components/admin/dashboard/currency-stat-value";

export function FleetStockValueCard({ totals }: { totals: Record<string, number> }) {
  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Total Stock Value
          </CardTitle>
          <CardDescription>Cost value of stock held across the fleet</CardDescription>
        </div>
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
      </CardHeader>
      <CardContent>
        <CurrencyStatValue totals={totals} emptyLabel="No stock recorded" />
      </CardContent>
    </Card>
  );
}

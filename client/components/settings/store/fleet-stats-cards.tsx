import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMetricCurrency } from "@/lib/utils";
import type { FleetStats } from "@/lib/types/store";

export function FleetStatsCards({
  stats,
  currencyCode,
}: {
  stats: FleetStats["stats"];
  currencyCode?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Fleet Sales</p>
          <h3 className="text-2xl font-bold">{formatMetricCurrency(stats.total_sales.value, currencyCode)}</h3>
          <Badge variant="secondary">{stats.total_sales.growth}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Stores</p>
          <h3 className="text-2xl font-bold">{stats.stores_count}</h3>
          <Badge variant="secondary">{stats.last_sync === "Never" ? "Offline" : "Online"}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock Value</p>
          <h3 className="text-2xl font-bold">{formatMetricCurrency(stats.inventory_value.value, currencyCode)}</h3>
          <Badge variant="secondary">Live Stock</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fleet Customers</p>
          <h3 className="text-2xl font-bold">{stats.customers.value}</h3>
          <Badge variant="secondary">{stats.customers.growth}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

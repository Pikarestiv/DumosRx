"use client";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { 
  ChartConfig,
  ChartContainer 
} from "@/components/ui/chart";

const chartConfig = {
  inventory: {
    label: "Inventory Level",
    color: "#0ea5e9",
  },
} satisfies ChartConfig;

interface InventoryInsightsTabProps {
  inventoryAlerts: any[];
  salesByCategory: any[];
}

export function InventoryInsightsTab({
  inventoryAlerts,
  salesByCategory
}: InventoryInsightsTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Inventory Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Inventory Alerts
          </CardTitle>
          <CardDescription>
            Critical issues requiring immediate attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {inventoryAlerts.map((alert) => (
              <div
                key={alert.medicine}
                className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-100"
              >
                <div>
                  <p className="font-medium text-red-900">
                    {alert.medicine}
                  </p>
                  <p className="text-sm text-red-700">{alert.issue}</p>
                </div>
                <Badge
                  variant={
                    alert.severity === "critical"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {alert.severity.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stock Levels by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Levels by Category</CardTitle>
          <CardDescription>
            Current inventory distribution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={salesByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

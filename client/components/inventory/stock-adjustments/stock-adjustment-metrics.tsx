import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, AlertTriangle } from "lucide-react";

interface StockAdjustmentMetricsProps {
  totalAdjustments: number;
  pendingAdjustments: number;
  thisMonthAdjustments: number;
}

export function StockAdjustmentMetrics({
  totalAdjustments,
  pendingAdjustments,
  thisMonthAdjustments,
}: StockAdjustmentMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Total Adjustments
              </p>
              <p className="text-2xl font-bold">{totalAdjustments}</p>
            </div>
            <RotateCcw className="h-8 w-8 text-primary" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Pending Approval
              </p>
              <p className="text-2xl font-bold text-orange-600">
                {pendingAdjustments}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold">{thisMonthAdjustments}</p>
            </div>
            <RotateCcw className="h-8 w-8 text-accent" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

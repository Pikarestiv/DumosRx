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
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Total Adjustments
                </p>
                <p className="text-xl sm:text-2xl font-bold">{totalAdjustments}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-primary shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Pending Approval
                </p>
                <p className="text-xl sm:text-2xl font-bold text-orange-600">
                  {pendingAdjustments}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">This Month</p>
                <p className="text-xl sm:text-2xl font-bold">{thisMonthAdjustments}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-accent shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

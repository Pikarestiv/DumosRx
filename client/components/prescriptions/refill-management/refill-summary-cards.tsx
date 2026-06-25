import { Card, CardContent } from "@/components/ui/card";
import { Clock, AlertTriangle, Calendar, CheckCircle } from "lucide-react";

interface RefillSummaryCardsProps {
  dueCount: number;
  overdueCount: number;
  earlyCount: number;
  completedCount: number;
}

export function RefillSummaryCards({
  dueCount,
  overdueCount,
  earlyCount,
  completedCount,
}: RefillSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Due for Refill</p>
              <p className="text-2xl font-bold text-blue-600">{dueCount}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold text-red-600">
                {overdueCount}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Early Requests</p>
              <p className="text-2xl font-bold text-gray-600">{earlyCount}</p>
            </div>
            <Calendar className="h-8 w-8 text-gray-600" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-green-600">
                {completedCount}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

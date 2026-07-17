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
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Due for Refill</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600">{dueCount}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Overdue</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600">
                  {overdueCount}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Early Requests</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-600">{earlyCount}</p>
              </div>
              <Calendar className="h-8 w-8 text-gray-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Completed</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">
                  {completedCount}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

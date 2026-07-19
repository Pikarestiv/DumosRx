"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock, Pill, CheckCircle, AlertTriangle } from "lucide-react";

interface PrescriptionStatsProps {
  stats: {
    pending: number;
    inProgress: number;
    ready: number;
    urgent: number;
  };
}

export function PrescriptionStats({ stats }: PrescriptionStatsProps) {
  return (
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Pending</p>
                <p className="text-xl sm:text-2xl font-bold text-orange-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">In Progress</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600">{stats.inProgress}</p>
              </div>
              <Pill className="h-8 w-8 text-blue-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Ready</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.ready}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Urgent</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.urgent}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { CheckCircle2, CalendarIcon } from "lucide-react";
import { getLocalTodayDate } from "@/lib/utils";

interface DailyCloseHeaderProps {
  reportDate: string;
  setReportDate: (date: string) => void;
}

export function DailyCloseHeader({
  reportDate,
  setReportDate,
}: DailyCloseHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <Alert className="bg-primary/5 border-primary/20 flex-1">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <AlertTitle>Daily Close Ready</AlertTitle>
        <AlertDescription>
          This report aggregates all transactions made on {reportDate}. Use this
          for end of day reconciliation.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 shrink-0 bg-background border rounded-md px-3 py-2 shadow-sm">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Date:
        </label>
        <Input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          max={getLocalTodayDate()}
          className="w-auto h-8 border-none shadow-none focus-visible:ring-0 px-1"
        />
      </div>
    </div>
  );
}

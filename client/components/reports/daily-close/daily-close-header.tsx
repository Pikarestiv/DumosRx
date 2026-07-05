import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { CheckCircle2, CalendarIcon, Save, CloudUpload } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";

interface DailyCloseHeaderProps {
  reportDate: string;
  setReportDate: (date: string) => void;
}

export function DailyCloseHeader({
  reportDate,
  setReportDate,
}: DailyCloseHeaderProps) {
  const { handleDownloadBackup, handleSync } = useSettings();

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <Alert className="bg-primary/5 border-primary/20 flex-1">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <AlertTitle>Daily Close Ready</AlertTitle>
        <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
          <span>
            This report aggregates all transactions made on {reportDate}. Use this
            for end of day reconciliation.
          </span>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <Button variant="outline" size="sm" onClick={handleDownloadBackup} className="h-8">
              <Save className="h-4 w-4 mr-2" />
              Download Local Backup
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSync(true)} className="h-8">
              <CloudUpload className="h-4 w-4 mr-2" />
              Cloud Sync Now
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 shrink-0 bg-background border rounded-md px-3 py-2 shadow-sm">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Date:
        </label>
        <DatePickerInput
          value={reportDate}
          onChange={(val) => setReportDate(val)}
          className="w-40 border-none shadow-none focus-visible:ring-0 px-1"
        />
      </div>
    </div>
  );
}

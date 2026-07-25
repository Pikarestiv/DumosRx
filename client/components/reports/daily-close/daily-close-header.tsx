import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Save, CloudUpload } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";

interface DailyCloseHeaderProps {
  reportDate: string;
}

export function DailyCloseHeader({ reportDate }: DailyCloseHeaderProps) {
  const { handleDownloadBackup, handleSync } = useSettings();

  return (
    <Alert className="bg-primary/5 border-primary/20">
      <CheckCircle2 className="h-4 w-4 text-primary" />
      <AlertTitle>Daily Close Ready</AlertTitle>
      <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
        <span>
          This report aggregates all transactions made on {reportDate}. Use this
          for end of day reconciliation.
        </span>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <Button variant="outline" size="sm" onClick={handleDownloadBackup} className="h-8 w-full sm:w-auto">
            <Save className="h-4 w-4 mr-2" />
            Download Local Backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSync(true)} className="h-8 w-full sm:w-auto">
            <CloudUpload className="h-4 w-4 mr-2" />
            Cloud Sync Now
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DailyCloseActionsProps {
  exportToCSV: () => void;
}

export function DailyCloseActions({ exportToCSV }: DailyCloseActionsProps) {
  return (
    <div className="flex justify-end gap-3">
      <Button
        variant="outline"
        onClick={() => window.print()}
        className="gap-2"
      >
        <Printer className="h-4 w-4" />
        Print
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportToCSV} className="cursor-pointer">
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.print()}
            className="cursor-pointer"
          >
            Export PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

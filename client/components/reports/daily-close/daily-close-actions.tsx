import { RefObject } from "react";
import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { printNode } from "@/lib/utils/print-node";
import { downloadBlob } from "@/lib/utils/report-pdf";
import { DailyClosePdf } from "./daily-close-pdf";

interface DailyCloseActionsProps {
  exportToCSV: () => void;
  printRef: RefObject<HTMLDivElement | null>;
  pdfInput: Omit<
    React.ComponentProps<typeof DailyClosePdf>,
    "generatedAt"
  >;
}

export function DailyCloseActions({
  exportToCSV,
  printRef,
  pdfInput,
}: DailyCloseActionsProps) {
  const handlePrint = () => {
    if (printRef.current) printNode(printRef.current);
  };

  const handleDownloadPdf = async () => {
    const blob = await pdf(
      <DailyClosePdf
        {...pdfInput}
        generatedAt={format(new Date(), "d MMM yyyy, h:mm a")}
      />,
    ).toBlob();
    downloadBlob(blob, `DailyClose_${pdfInput.reportDate}.pdf`);
  };

  return (
    <div className="flex justify-end gap-3">
      <Button variant="outline" onClick={handlePrint} className="gap-2">
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
            onClick={handleDownloadPdf}
            className="cursor-pointer"
          >
            Export PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

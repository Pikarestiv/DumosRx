import { RefObject } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { printNode } from "@/lib/utils/print-node";
import { downloadBlob } from "@/lib/utils/download-blob";
// Type-only: the component itself is loaded lazily in the handler below,
// since daily-close-pdf.tsx statically imports @react-pdf/renderer.
import type { DailyClosePdf } from "./daily-close-pdf";

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
    if (printRef.current) {
      printNode(printRef.current).catch((err) => {
        console.error("[print] Failed to print daily close:", err);
        toast.error("Couldn't open the print dialog. Please try again.");
      });
    }
  };

  // @react-pdf/renderer and the PDF document are both pulled in on demand:
  // statically imported, they were downloaded and parsed on every visit to
  // the Reports route just in case someone exported.
  const handleDownloadPdf = async () => {
    const [{ pdf }, { DailyClosePdf }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./daily-close-pdf"),
    ]);
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
            onClick={() => void handleDownloadPdf()}
            className="cursor-pointer"
          >
            Export PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

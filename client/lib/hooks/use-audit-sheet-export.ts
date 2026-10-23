import { useRef, useState } from "react";
import { toast } from "sonner";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  auditExportFileName,
  describeAuditLens,
  type AuditLens,
} from "@/components/stock-batch/audit-derivations";
import {
  generateReportPdfBlob,
  PdfGenerationCancelledError,
} from "@/lib/utils/report-pdf";
import { downloadBlob } from "@/lib/utils/download-blob";
import { printNode } from "@/lib/utils/print-node";
import {
  buildStockAuditRows,
  buildBlobFromRows,
} from "@/lib/utils/product-import-export";

export interface AuditSheet {
  subtitle: string;
  headers: string[];
  rows: Record<string, unknown>[];
  columnFlex: number[];
}

interface AuditSheetExportInput {
  exportItems: AuditItem[];
  lens: AuditLens;
  totalCount: number;
}

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

function buildAuditSheet({
  exportItems,
  lens,
  totalCount,
}: AuditSheetExportInput): AuditSheet {
  return {
    subtitle: describeAuditLens(lens, exportItems.length, totalCount),
    ...buildStockAuditRows(
      exportItems.map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.systemQty,
        countedQty: item.countedQty,
      })),
    ),
  };
}

export function useAuditSheetExport(
  input: AuditSheetExportInput,
  storeName: string,
) {
  const [printStage, setPrintStage] = useState<
    { message: string; progress: number } | null
  >(null);
  const [printSheet, setPrintSheet] = useState<AuditSheet | null>(null);
  const printableRef = useRef<HTMLDivElement>(null);
  const pdfAbortRef = useRef<AbortController | null>(null);

  const setPrintProgress = async (message: string, progress: number) => {
    setPrintStage({ message, progress });
    await nextFrame();
  };

  const handlePrint = async () => {
    setPrintSheet(buildAuditSheet(input));
    try {
      // Two frames: React commits the sheet, then the browser lays it out.
      await nextFrame();
      await nextFrame();
      if (!printableRef.current) return;
      await printNode(printableRef.current);
    } catch (error) {
      console.error("Failed to print stock audit sheet:", error);
      toast.error("Couldn't open the print dialog. Please try again.");
    } finally {
      setPrintSheet(null);
    }
  };

  const handleDownloadPdf = async () => {
    await setPrintProgress("Preparing rows...", 25);
    const sheet = buildAuditSheet(input);
    const controller = new AbortController();
    pdfAbortRef.current = controller;
    try {
      await setPrintProgress("Rendering PDF...", 60);
      const blob = await generateReportPdfBlob(
        { storeName, title: "Stock Audit Sheet", ...sheet },
        controller.signal,
      );
      downloadBlob(blob, auditExportFileName(input.lens, "pdf"));
      await setPrintProgress("Done", 100);
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (error) {
      if (!(error instanceof PdfGenerationCancelledError)) {
        console.error("Failed to generate stock audit PDF:", error);
        toast.error("Couldn't generate the PDF. Please try again.");
      }
    } finally {
      pdfAbortRef.current = null;
      setPrintStage(null);
    }
  };

  const handleCancelPdfDownload = () => {
    pdfAbortRef.current?.abort();
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    const { headers, rows } = buildAuditSheet(input);
    const blob = await buildBlobFromRows(headers, rows, format, "Stock Audit");
    downloadBlob(blob, auditExportFileName(input.lens, format));
  };

  return {
    printStage,
    printSheet,
    printableRef,
    handlePrint,
    handleDownloadPdf,
    handleCancelPdfDownload,
    handleExport,
  };
}

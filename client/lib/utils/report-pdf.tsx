import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { ReportPdfDocument } from "@/components/reports/pdf/report-pdf-document";

export interface ReportPdfInput {
  storeName: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export async function generateReportPdfBlob(
  input: ReportPdfInput,
): Promise<Blob> {
  const doc = (
    <ReportPdfDocument
      {...input}
      generatedAt={format(new Date(), "d MMM yyyy, h:mm a")}
    />
  );
  return pdf(doc).toBlob();
}

export function downloadBlob(blob: Blob, filename: string): number {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return blob.size;
}

/**
 * Opens the PDF in a new tab so the user can print from the browser's native
 * PDF viewer — same document as the download, so "Print" and "Download PDF"
 * can never produce different-looking output for the same report.
 */
export function openBlobForPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke well after the new tab has had time to load the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

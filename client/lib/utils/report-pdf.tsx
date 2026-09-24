import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import { ReportPdfDocument } from "@/components/reports/pdf/report-pdf-document";

export interface ReportPdfInput {
  storeName: string;
  title: string;
  subtitle?: string;
  /** Optional caveat about the figures (e.g. a filtered P&L excluding
   * expenses), rendered under the subtitle in the document header. */
  note?: string;
  headers: string[];
  rows: Record<string, unknown>[];
  columnFlex?: number[];
}

export class PdfGenerationCancelledError extends Error {
  constructor() {
    super("PDF generation cancelled");
    this.name = "PdfGenerationCancelledError";
  }
}

/** Runs the (main-thread-blocking) PDF render in a Web Worker so a large
 * report doesn't freeze the UI or trigger the browser's "page unresponsive"
 * prompt - see lib/workers/report-pdf.worker.ts for why that's safe here.
 * Falls back to rendering inline if the worker can't be created at all
 * (e.g. an unusual embedding context that blocks Worker), so the export
 * still works, just without the off-thread benefit.
 *
 * `signal`, when passed, lets a caller abort a slow render (e.g. a stock
 * audit with thousands of rows) - only honored on the worker path, since
 * the main-thread fallback runs synchronously and can't be interrupted
 * mid-render anyway. */
export async function generateReportPdfBlob(
  input: ReportPdfInput,
  signal?: AbortSignal,
): Promise<Blob> {
  const generatedAt = format(new Date(), "d MMM yyyy, h:mm a");

  try {
    return await generateReportPdfBlobInWorker({ ...input, generatedAt }, signal);
  } catch (error) {
    if (error instanceof PdfGenerationCancelledError) throw error;
    console.error(
      "PDF worker unavailable, falling back to main-thread render:",
      error,
    );
    const doc = <ReportPdfDocument {...input} generatedAt={generatedAt} />;
    return pdf(doc).toBlob();
  }
}

function generateReportPdfBlobInWorker(
  input: ReportPdfInput & { generatedAt: string },
  signal?: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/report-pdf.worker.ts", import.meta.url),
    );

    const onAbort = () => {
      worker.terminate();
      reject(new PdfGenerationCancelledError());
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort);
    }

    worker.onmessage = (event: MessageEvent) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      if (event.data?.ok) resolve(event.data.blob as Blob);
      else reject(new Error(event.data?.error || "PDF generation failed"));
    };
    worker.onerror = (event) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      reject(event.error || new Error("PDF worker error"));
    };
    worker.postMessage(input);
  });
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
 * PDF viewer: same document as the download, so "Print" and "Download PDF"
 * can never produce different-looking output for the same report.
 */
export function openBlobForPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke well after the new tab has had time to load the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

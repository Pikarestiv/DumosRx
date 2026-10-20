import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReportPdfDocument } from "@/components/reports/pdf/report-pdf-document";
import type { ReportPdfInput } from "@/lib/utils/report-pdf";

// Runs the actual PDF layout/render off the main thread.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#workers-report-pdf.worker-L6
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = self;

interface PdfWorkerRequest extends ReportPdfInput {
  generatedAt: string;
}

ctx.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  try {
    const doc = createElement(ReportPdfDocument, event.data);
    const blob = await pdf(doc).toBlob();
    ctx.postMessage({ ok: true, blob });
  } catch (error) {
    ctx.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

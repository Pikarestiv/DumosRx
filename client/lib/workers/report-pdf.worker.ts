import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReportPdfDocument } from "@/components/reports/pdf/report-pdf-document";
import type { ReportPdfInput } from "@/lib/utils/report-pdf";

/**
 * Runs the actual PDF layout/render off the main thread. @react-pdf/renderer
 * has no progress hook and its layout pass is a single synchronous call -
 * for a large export (thousands of rows) that's long enough to freeze the
 * UI and trigger the browser's "page unresponsive" prompt if run inline.
 * Neither react (createElement only, no react-dom) nor @react-pdf/renderer's
 * own reconciler touch window/document, so this is safe to run in a worker.
 *
 * ctx is typed `any` deliberately: this file's tsconfig pulls in the "dom"
 * lib project-wide, which declares a conflicting (Window-shaped) `self` -
 * there's no clean way to also apply "webworker" lib types to just this one
 * file, so the worker's actual DedicatedWorkerGlobalScope shape is accessed
 * through an escape hatch instead of fighting the type checker over it.
 */
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

/**
 * Kept in its own module, deliberately: this is ten lines with no
 * dependencies, but it used to live in report-pdf.tsx alongside the actual
 * PDF-generation code. Importing it from there pulled @react-pdf/renderer into
 * the catalog, daily-close and purchase-order-details chunks for callers that
 * only ever wanted to hand the browser a Blob.
 */
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
 * Opens a PDF in a new tab so the user can print from the browser's native
 * PDF viewer: same document as the download, so "Print" and "Download PDF"
 * can never produce different-looking output for the same report.
 */
export function openBlobForPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke well after the new tab has had time to load the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

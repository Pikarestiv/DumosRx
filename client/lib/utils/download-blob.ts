// Kept in its own module, deliberately:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-download-blob-ts-L1
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

// Opens a PDF in a new tab so the user can print from the browser's native PDF viewer:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-download-blob-ts-L20
export function openBlobForPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke well after the new tab has had time to load the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

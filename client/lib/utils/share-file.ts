import { downloadBlob } from "./download-blob";

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || "application/pdf" });
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

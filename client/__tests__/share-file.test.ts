import { describe, it, expect, vi, afterEach } from "vitest";
import { shareOrDownload } from "@/lib/utils/share-file";

const blob = new Blob(["%PDF"], { type: "application/pdf" });

describe("shareOrDownload", () => {
  const original = { share: navigator.share, canShare: navigator.canShare };
  const createObjectURL = vi.fn(() => "blob:x");

  afterEach(() => {
    Object.assign(navigator, original);
    vi.restoreAllMocks();
  });

  const stubDownload = () => {
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  };

  it("hands the PDF to the system share sheet when the device can share files", async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { share, canShare: () => true });
    expect(await shareOrDownload(blob, "PO-1.pdf", "PO-1")).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "PO-1" }));
  });

  it("downloads instead where sharing files is not supported", async () => {
    const click = stubDownload();
    Object.assign(navigator, { share: undefined, canShare: undefined });
    expect(await shareOrDownload(blob, "PO-1.pdf", "PO-1")).toBe("downloaded");
    expect(click).toHaveBeenCalled();
  });

  it("treats a dismissed share sheet as cancelled, not as a failure to fall back from", async () => {
    Object.assign(navigator, { share: () => Promise.reject(new DOMException("no", "AbortError")), canShare: () => true });
    expect(await shareOrDownload(blob, "PO-1.pdf", "PO-1")).toBe("cancelled");
  });

  it("downloads when the share sheet fails for another reason", async () => {
    const click = stubDownload();
    Object.assign(navigator, { share: () => Promise.reject(new Error("blocked")), canShare: () => true });
    expect(await shareOrDownload(blob, "PO-1.pdf", "PO-1")).toBe("downloaded");
    expect(click).toHaveBeenCalled();
  });
});

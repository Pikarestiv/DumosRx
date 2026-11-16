import { describe, it, expect, vi, afterEach } from "vitest";
import {
  compressProductImage,
  encodeWithinBudget,
  fitWithin,
  ImageRejectedError,
  MAX_SOURCE_BYTES,
  TARGET_BYTES,
  validateSourceFile,
} from "@/lib/product-images/compress";

const KB = 1024;

function blobOf(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

function encoderBySize(sizes: Record<string, number[]>) {
  const calls: Array<[string, number]> = [];
  const encode = async (type: string, quality: number) => {
    calls.push([type, quality]);
    const queue = sizes[type];
    if (!queue) return blobOf(10, "image/png");
    const size = queue.shift();
    return size === undefined ? null : blobOf(size, type);
  };
  return { encode, calls };
}

describe("validateSourceFile", () => {
  it("rejects a non-image", () => {
    expect(() => validateSourceFile({ type: "application/pdf", size: 10 })).toThrow(ImageRejectedError);
    expect(() => validateSourceFile({ type: "", size: 10 })).toThrow(/not an image/);
  });

  it("rejects a source over 5 MB and accepts one exactly at the limit", () => {
    expect(() => validateSourceFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 })).toThrow(/5 MB/);
    expect(() => validateSourceFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES })).not.toThrow();
  });
});

describe("fitWithin", () => {
  it.each([
    [4000, 3000, 512, 384],
    [3000, 4000, 384, 512],
    [512, 512, 512, 512],
    [200, 100, 200, 100],
    [10000, 1, 512, 1],
  ])("%sx%s fits as %sx%s without upscaling", (w, h, ew, eh) => {
    expect(fitWithin(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe("encodeWithinBudget", () => {
  it("returns the first WebP at or under the target size", async () => {
    const { encode } = encoderBySize({ "image/webp": [300 * KB, 150 * KB, 100 * KB, 50 * KB] });

    const blob = await encodeWithinBudget(encode);

    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(100 * KB);
    expect(blob.size).toBeLessThanOrEqual(TARGET_BYTES);
  });

  it("falls back to JPEG when the browser cannot encode WebP", async () => {
    const { encode } = encoderBySize({ "image/jpeg": [90 * KB] });

    const blob = await encodeWithinBudget(encode);

    expect(blob.type).toBe("image/jpeg");
  });

  it("settles for the smallest result over target when it is still under the hard cap", async () => {
    const { encode } = encoderBySize({ "image/webp": [250 * KB, 200 * KB, 180 * KB, 170 * KB, 160 * KB, 150 * KB] });

    const blob = await encodeWithinBudget(encode, 256 * KB);

    expect(blob.size).toBe(150 * KB);
  });

  it("rejects when nothing fits under the hard cap", async () => {
    const { encode } = encoderBySize({ "image/webp": [400 * KB, 390 * KB, 380 * KB, 370 * KB, 360 * KB, 350 * KB] });

    await expect(encodeWithinBudget(encode, 256 * KB)).rejects.toThrow(ImageRejectedError);
  });
});

describe("compressProductImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws the decoded image at the fitted size and returns an encoded blob", async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob) => void, type: string) => cb(blobOf(60 * KB, type)),
    };
    vi.spyOn(document, "createElement").mockReturnValueOnce(canvas as unknown as HTMLElement);
    vi.stubGlobal("createImageBitmap", async () => ({ width: 2048, height: 1024, close: () => {} }));

    const blob = await compressProductImage(new File([new Uint8Array(1000)], "p.jpg", { type: "image/jpeg" }));

    expect(blob.type).toBe("image/webp");
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 256);
  });

  it("reports an undecodable file as a rejected image", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("decode failed");
    });

    await expect(
      compressProductImage(new File([new Uint8Array(10)], "x.heic", { type: "image/heic" })),
    ).rejects.toThrow(/could not be read/);
  });
});

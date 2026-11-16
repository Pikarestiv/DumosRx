export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_EDGE_PX = 512;
export const TARGET_BYTES = 120 * 1024;
export const DEFAULT_HARD_CAP_BYTES = 256 * 1024;

const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];
const OUTPUT_TYPES = ["image/webp", "image/jpeg"] as const;

export type Encoder = (type: string, quality: number) => Promise<Blob | null>;

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageRejectedError";
  }
}

export function validateSourceFile(file: { type: string; size: number }): void {
  if (!file.type.startsWith("image/")) {
    throw new ImageRejectedError("That file is not an image. Choose a photo (JPG, PNG or WebP).");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageRejectedError("That photo is larger than 5 MB. Choose a smaller one.");
  }
}

export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function encodeWithinBudget(encode: Encoder, hardCapBytes = DEFAULT_HARD_CAP_BYTES): Promise<Blob> {
  let smallest: Blob | null = null;

  for (const type of OUTPUT_TYPES) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(type, quality);
      if (!blob || blob.type !== type) break;
      if (blob.size <= TARGET_BYTES) return blob;
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
    if (smallest) break;
  }

  if (smallest && smallest.size <= hardCapBytes) return smallest;
  throw new ImageRejectedError("This photo could not be made small enough. Try a simpler photo.");
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ImageRejectedError("This image could not be read. Try a JPG or PNG photo.");
  }
}

export async function compressProductImage(file: File, hardCapBytes = DEFAULT_HARD_CAP_BYTES): Promise<Blob> {
  validateSourceFile(file);
  const bitmap = await decode(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageRejectedError("This device cannot resize images.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return encodeWithinBudget(
    (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)),
    hardCapBytes,
  );
}

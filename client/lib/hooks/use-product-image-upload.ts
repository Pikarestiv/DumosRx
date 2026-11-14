import { useCallback, useState, useSyncExternalStore } from "react";
import { apiClient } from "@/lib/api/client";
import { execute, queueTableInvalidation } from "@/lib/db/core";
import { compressProductImage, ImageRejectedError } from "@/lib/product-images/compress";
import { useProductImageConfig } from "@/lib/product-images/config-store";

export type ProductImageStatus = "idle" | "compressing" | "uploading" | "saving" | "removing";

export const OFFLINE_IMAGE_MESSAGE =
  "You're offline. Images are uploaded straight to the cloud, so connect to the internet to change this image. The rest of the product saves as normal.";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function describeFailure(error: unknown): string {
  if (error instanceof ImageRejectedError) return error.message;
  if (typeof navigator !== "undefined" && !navigator.onLine) return OFFLINE_IMAGE_MESSAGE;
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) return "You don't have permission to change product images.";
  if (status === 422 && error instanceof Error) return error.message;
  return "The image could not be uploaded. Check your connection and try again.";
}

async function saveImageKeyLocally(productId: string, imageKey: string | null): Promise<void> {
  await execute("UPDATE products SET image_key = ? WHERE id = ?", [imageKey, productId]);
  queueTableInvalidation("products");
}

async function putToStorage(uploadUrl: string, headers: Record<string, string>, body: Blob): Promise<void> {
  const response = await fetch(uploadUrl, { method: "PUT", headers, body });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
}

export function useProductImageUpload(productId: string) {
  const config = useProductImageConfig();
  const isOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [status, setStatus] = useState<ProductImageStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void>) => {
    setError(null);
    if (!navigator.onLine) {
      setError(OFFLINE_IMAGE_MESSAGE);
      return false;
    }
    try {
      await work();
      return true;
    } catch (failure) {
      setError(describeFailure(failure));
      return false;
    } finally {
      setStatus("idle");
    }
  }, []);

  const upload = useCallback(
    (file: File) =>
      run(async () => {
        setStatus("compressing");
        const blob = await compressProductImage(file, config.max_bytes);
        setStatus("uploading");
        const presign = await apiClient.presignProductImage(productId, blob.type, blob.size);
        await putToStorage(presign.upload_url, presign.headers, blob);
        setStatus("saving");
        const saved = await apiClient.confirmProductImage(productId, presign.key);
        await saveImageKeyLocally(productId, saved.image_key);
      }),
    [run, productId, config.max_bytes],
  );

  const remove = useCallback(
    () =>
      run(async () => {
        setStatus("removing");
        await apiClient.deleteProductImage(productId);
        await saveImageKeyLocally(productId, null);
      }),
    [run, productId],
  );

  return { status, error, isOnline, isBusy: status !== "idle", upload, remove, clearError: () => setError(null) };
}

"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProductImage } from "@/components/products/product-image";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useProductImageConfig } from "@/lib/product-images/config-store";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import {
  OFFLINE_IMAGE_MESSAGE,
  useProductImageUpload,
  type ProductImageStatus,
} from "@/lib/hooks/use-product-image-upload";

const STATUS_TEXT: Record<Exclude<ProductImageStatus, "idle">, string> = {
  compressing: "Preparing image…",
  uploading: "Uploading…",
  saving: "Saving…",
  removing: "Removing…",
};

interface ProductImageSectionProps {
  productId: string;
  productName: string;
  imageKey?: string | null;
  categoryName?: string | null;
}

export function ProductImageSection({ productId, productName: storedName, imageKey, categoryName }: ProductImageSectionProps) {
  const productName = useDisplayName()(storedName);
  const config = useProductImageConfig();
  const canEdit = useHasPermission("manage_products");
  const image = useProductImageUpload(productId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  if (!config.enabled) return null;

  const hasImage = Boolean(imageKey);
  const disabled = !image.isOnline || image.isBusy;
  const message = image.status !== "idle" ? STATUS_TEXT[image.status] : image.error ?? (!image.isOnline && canEdit ? OFFLINE_IMAGE_MESSAGE : null);

  const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && (await image.upload(file))) toast.success("Product image saved");
  };

  const onRemove = async () => {
    setConfirmingRemove(false);
    if (await image.remove()) toast.success("Product image removed");
  };

  return (
    <section aria-labelledby={`product-image-${productId}`} className="space-y-3">
      <h3 id={`product-image-${productId}`} className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
        Image
      </h3>
      <div className="flex items-start gap-4">
        <ProductImage
          imageKey={imageKey}
          categoryName={categoryName}
          alt={productName}
          sizePx={112}
          className="h-28 w-28 shrink-0 rounded-xl border border-border bg-primary/5 text-primary/70"
          iconClassName="h-8 w-8"
        />
        {canEdit && (
          <div className="flex flex-col gap-2 min-w-0">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`Choose an image for ${productName}`}
              onChange={(event) => void onFileChosen(event)}
              tabIndex={-1}
            />
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => fileInput.current?.click()}>
              {image.isBusy && image.status !== "removing" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
              {hasImage ? "Replace image" : "Upload image"}
            </Button>
            {hasImage && (
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => setConfirmingRemove(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Remove image
              </Button>
            )}
          </div>
        )}
      </div>
      <p role="status" aria-live="polite" className={image.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {message}
      </p>
      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        onConfirm={onRemove}
        title="Remove product image"
        description={`${productName} will go back to its category icon on every till and on your online store.`}
        confirmLabel="Remove"
        variant="destructive"
      />
    </section>
  );
}

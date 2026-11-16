"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { CategoryIcon } from "@/components/pos/category-icon";
import { ProductImageLightbox } from "@/components/products/product-image-lightbox";
import { productImageUrl, useProductImageConfig } from "@/lib/product-images/config-store";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  imageKey?: string | null;
  categoryName?: string | null;
  productName?: string | null;
  alt: string;
  sizePx: number;
  className?: string;
  iconClassName?: string;
  showImage?: boolean;
  fit?: "cover" | "contain";
  zoom?: "corner" | "full";
}

export function ProductImage({
  imageKey,
  categoryName,
  productName,
  alt,
  sizePx,
  className,
  iconClassName,
  showImage = true,
  fit = "cover",
  zoom,
}: ProductImageProps) {
  const config = useProductImageConfig();
  const src = showImage ? productImageUrl(config, imageKey) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  if (!src || failedSrc === src) {
    return (
      <div className={cn("flex items-center justify-center", className)} data-testid="product-image-fallback">
        <CategoryIcon categoryName={categoryName} productName={productName} className={iconClassName} />
      </div>
    );
  }

  const zoomName = productName || alt || "Product image";

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img
        src={src}
        alt={alt}
        width={sizePx}
        height={sizePx}
        loading="lazy"
        decoding="async"
        crossOrigin="anonymous"
        onError={() => setFailedSrc(src)}
        className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
      />
      {zoom === "full" && (
        <button
          type="button"
          aria-label={`View larger image of ${zoomName}`}
          onClick={() => setZoomed(true)}
          className="absolute inset-0 cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      {zoom === "corner" && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`View larger image of ${zoomName}`}
          onClick={(event) => {
            event.stopPropagation();
            setZoomed(true);
          }}
          className="absolute bottom-0 right-0 flex h-5 w-5 cursor-zoom-in items-center justify-center rounded-tl-md bg-background/80 text-foreground"
        >
          <Maximize2 className="h-3 w-3" />
        </span>
      )}
      {zoom && <ProductImageLightbox src={src} name={zoomName} open={zoomed} onOpenChange={setZoomed} />}
    </div>
  );
}

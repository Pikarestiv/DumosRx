"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { CategoryIcon } from "@/components/pos/category-icon";
import { ProductImageLightbox } from "@/components/products/product-image-lightbox";
import { productImageUrl, useProductImageConfig } from "@/lib/product-images/config-store";
import { useHasTouchCapability } from "@/lib/hooks/use-has-touch-capability";
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
  zoom?: "overlay" | "full";
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
  const isTouch = useHasTouchCapability();

  if (!src || failedSrc === src) {
    return (
      <div className={cn("flex items-center justify-center", className)} data-testid="product-image-fallback">
        <CategoryIcon categoryName={categoryName} productName={productName} className={iconClassName} />
      </div>
    );
  }

  const zoomName = productName || alt || "Product image";

  return (
    <div className={cn("group/image relative overflow-hidden", className)}>
      {zoom && (
        <span className="contents" onClick={(event) => event.stopPropagation()}>
          <ProductImageLightbox src={src} name={zoomName} open={zoomed} onOpenChange={setZoomed} />
        </span>
      )}
      {fit === "contain" && (
        <img
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-md"
        />
      )}
      <img
        src={src}
        alt={alt}
        width={sizePx}
        height={sizePx}
        loading="lazy"
        decoding="async"
        crossOrigin="anonymous"
        onError={() => setFailedSrc(src)}
        className={cn("relative h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
      />
      {zoom === "full" && (
        <button
          type="button"
          aria-label={`View larger image of ${zoomName}`}
          onClick={() => setZoomed(true)}
          className="absolute inset-0 cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      {zoom === "overlay" && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`View larger image of ${zoomName}`}
          onClick={(event) => {
            event.stopPropagation();
            setZoomed(true);
          }}
          className={cn(
            "absolute flex cursor-zoom-in items-center justify-center bg-background/85 text-foreground shadow-sm",
            isTouch
              ? "bottom-0 right-0 h-6 w-6 rounded-tl-md"
              : "left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover/image:opacity-100",
          )}
        >
          <Maximize2 className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

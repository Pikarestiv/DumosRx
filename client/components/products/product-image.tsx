"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/pos/category-icon";
import { productImageUrl, useProductImageConfig } from "@/lib/product-images/config-store";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  imageKey?: string | null;
  categoryName?: string | null;
  alt: string;
  sizePx: number;
  className?: string;
  iconClassName?: string;
  showImage?: boolean;
  fit?: "cover" | "contain";
}

export function ProductImage({
  imageKey,
  categoryName,
  alt,
  sizePx,
  className,
  iconClassName,
  showImage = true,
  fit = "cover",
}: ProductImageProps) {
  const config = useProductImageConfig();
  const src = showImage ? productImageUrl(config, imageKey) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div className={cn("flex items-center justify-center", className)} data-testid="product-image-fallback">
        <CategoryIcon categoryName={categoryName} className={iconClassName} />
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden", className)}>
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
    </div>
  );
}

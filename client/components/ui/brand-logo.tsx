"use client";

import { cn } from "@/lib/utils";

interface BrandLogoProps {
  src?: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export function BrandLogo({
  src = "/logo.png",
  alt,
  width,
  height,
  className,
}: BrandLogoProps) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn("bg-primary shrink-0", className)}
      style={{
        width,
        height,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface ProductImageLightboxProps {
  src: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductImageLightbox({ src, name, open, onOpenChange }: ProductImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,34rem)] max-w-none gap-3 p-3 sm:max-w-none">
        <DialogTitle className="truncate pr-8 text-base">{name}</DialogTitle>
        <DialogDescription className="sr-only">Enlarged product image</DialogDescription>
        <div className="flex items-center justify-center rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN image, no optimizer in the static export */}
          <img src={src} alt={name} crossOrigin="anonymous" className="max-h-[75vh] w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

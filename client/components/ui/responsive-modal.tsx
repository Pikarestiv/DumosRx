"use client";

import * as React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { X } from "lucide-react";
import { ScrollFade } from "@/components/ui/scroll-fade";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Custom class for the content container */
  className?: string;
  /** Custom class for the header container */
  headerClassName?: string;
  /**
   * Action buttons rendered outside the scrollable area, pinned below the
   * content on mobile so they can't be scrolled out of view.
   */
  footer?: React.ReactNode;
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  headerClassName,
  footer,
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`${className} p-6 px-5.5`}>
          <DialogHeader className={headerClassName}>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="responsive-modal-fields flex flex-col flex-1 min-h-0 overflow-hidden px-0.5">
            {children}
          </div>
          {footer}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn("max-h-[90vh] flex flex-col px-4", className)}
      >
        <DrawerHeader
          className={cn(
            "text-left mb-4 px-0 flex flex-row items-start justify-between",
            headerClassName,
          )}
        >
          <div className="flex flex-col gap-2 sm:gap-0">
            <DrawerTitle>{title}</DrawerTitle>
            {description && (
              <DrawerDescription>{description}</DrawerDescription>
            )}
          </div>
          <DrawerClose className="p-1">
            <X className="h-5 w-5 opacity-70" />
            <span className="sr-only">Close</span>
          </DrawerClose>
        </DrawerHeader>
        <ScrollFade containerClassName="responsive-modal-fields flex-1">
          {children}
        </ScrollFade>
        {footer && <div className="pt-4 pb-2 shrink-0">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}

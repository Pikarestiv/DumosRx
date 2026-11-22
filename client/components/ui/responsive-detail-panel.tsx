"use client";

import * as React from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

interface ResponsiveDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional; every consumer's body already renders its own header/close row. */
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Desktop Sheet width override, e.g. "w-full sm:w-[600px]". Defaults to ~half the viewport. */
  widthClassName?: string;
}

export function ResponsiveDetailPanel({
  open,
  onOpenChange,
  title,
  children,
  className,
  widthClassName,
}: ResponsiveDetailPanelProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          hideClose
          className={cn(
            "w-full sm:w-1/2 sm:min-w-[560px] sm:max-w-[900px] p-0 flex flex-col bg-card",
            widthClassName ?? className,
          )}
        >
          <VisuallyHidden asChild>
            <SheetTitle>{title ?? "Details"}</SheetTitle>
          </VisuallyHidden>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "h-[88dvh] max-h-[88dvh] flex flex-col overflow-hidden bg-card border-border p-0",
          className,
        )}
        style={{
          paddingBottom: 0,
        }}
      >
        <VisuallyHidden asChild>
          <DrawerTitle>{title ?? "Details"}</DrawerTitle>
        </VisuallyHidden>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

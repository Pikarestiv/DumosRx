"use client";

import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ChevronUp, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface POMobileSummaryDrawerProps {
  itemCount: number;
  totalAmount: number;
  selectedSupplierName: string;
  onSave: () => void;
  isSubmitting: boolean;
}

/** Items are edited inline via POItemBuilder in the page body (card mode
 * on mobile), so this drawer only shows the running total/Save action, not
 * a duplicate read-only list. */
export function POMobileSummaryDrawer({
  itemCount,
  totalAmount,
  selectedSupplierName,
  onSave,
  isSubmitting,
}: POMobileSummaryDrawerProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
      <div className="pointer-events-auto">
        <Drawer>
          <DrawerTrigger asChild>
            <div className="w-full bg-primary text-primary-foreground p-3 rounded-[20px] cursor-pointer flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-primary/90 transition-colors">
              <div className="flex items-center gap-3.5">
                <div className="relative flex items-center justify-center w-[46px] h-[46px] rounded-[14px] bg-white/15">
                  <ShoppingCart className="w-5 h-5 text-white" />
                  <div className="absolute -top-1.5 -right-1.5 bg-white text-primary text-[11.5px] font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-sm">
                    {itemCount}
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[13.5px] font-medium text-white/90 leading-[1.2] mb-0.5">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </span>
                  <span className="text-[19px] font-bold leading-[1.2] tracking-tight">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>
              <ChevronUp className="w-6 h-6 mr-1 opacity-90" />
            </div>
          </DrawerTrigger>
          <DrawerContent className="h-auto mt-0 flex flex-col bg-background">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Order Summary</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-5 pb-3.5 border-b border-border shrink-0">
                <div className="text-[15px] font-semibold">Order Summary</div>
                <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
                  {selectedSupplierName}
                </div>
              </div>
              <div className="p-4 border-t border-border shrink-0 bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Estimated total
                  </div>
                  <div className="text-[19px] font-bold font-serif text-primary">
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
                <Button
                  className="w-full h-12 rounded-xl text-[14px] font-bold"
                  onClick={onSave}
                  disabled={isSubmitting || itemCount === 0}
                >
                  {isSubmitting ? "Creating..." : "Save Purchase Order"}
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

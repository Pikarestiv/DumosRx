"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Maximize, Search, FileClock, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store as StoreIcon } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CameraScannerDialog } from "./camera-scanner-dialog";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface POSLayoutHeaderProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  heldSalesCount: number;
  onOpenHeldSales: () => void;
  onScanSuccess: (barcode: string) => void;
}

export function POSLayoutHeader({
  searchTerm,
  onSearchChange,
  onKeyDown,
  searchInputRef,
  heldSalesCount,
  onOpenHeldSales,
  onScanSuccess
}: POSLayoutHeaderProps) {
  const router = useRouter();
  const { storeProfile } = useStore();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("action") === "scan") {
      setIsScannerOpen(true);
    }
  }, [searchParams]);

  return (
    <header
      className="h-auto min-h-16 py-3 bg-background flex items-center px-4 sm:px-6 sticky z-40 border-b border-border/50 before:absolute before:inset-x-0 before:bottom-full before:h-[100vh] before:bg-background before:-z-10"
      style={{ top: "var(--tauri-top, 0px)" }}
    >
      {/* Left side: Title and Back button */}
      <div className="flex items-center gap-3">
        <Button 
          variant="outline" 
          size="icon" 
          className="h-9 w-9 rounded-xl bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => router.push('/dashboard')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-base sm:text-lg font-semibold tracking-tight whitespace-nowrap leading-none">
            Point of sale
          </span>
          <div className="flex items-center gap-1 font-medium text-muted-foreground text-[10px] sm:text-xs">
            <StoreIcon className="h-3 w-3" />
            <span className="truncate max-w-[120px] sm:max-w-[200px]">
              {storeProfile?.name || APP_NAME}
            </span>
          </div>
        </div>
      </div>

      {/* Center: Search (Desktop only) */}
      <div className="hidden sm:flex flex-1 max-w-md ml-6 mr-auto">
        <div className="relative w-full group flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            </div>
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search products or SKU"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-10 pl-10 pr-10 bg-muted/30 border-border/50 hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-sm transition-all w-full"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer flex items-center justify-center"
              >
                <span className="sr-only">Clear</span>
                <span aria-hidden="true" className="text-lg font-bold leading-none">&times;</span>
              </button>
            )}
          </div>
          <Button
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-10 px-4"
            onClick={() => setIsScannerOpen(true)}
          >
            <Scan className="h-4 w-4" />
            Scan
          </Button>
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        {/* Fullscreen toggle (Desktop only) */}
        <Button 
          variant="outline" 
          size="icon" 
          className="hidden sm:flex h-10 w-10 shrink-0 rounded-xl border-border/50 bg-background text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else {
              document.exitFullscreen().catch(() => {});
            }
          }}
        >
          <Maximize className="h-4 w-4" />
        </Button>

        {/* Held Sales Button */}
        <Button 
          variant="outline" 
          size="icon" 
          onClick={onOpenHeldSales}
          className={cn(
            "relative h-10 w-10 shrink-0 rounded-xl border-border/50 bg-background hover:text-foreground transition-colors",
            heldSalesCount > 0 ? "text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 border-amber-500/20" : "text-muted-foreground"
          )}
        >
          <FileClock className="h-5 w-5" />
          {heldSalesCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground border-2 border-background">
              {heldSalesCount > 99 ? "99+" : heldSalesCount}
            </span>
          )}
        </Button>
      </div>

      <CameraScannerDialog 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScanSuccess={onScanSuccess} 
      />
    </header>
  );
}

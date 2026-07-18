"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Maximize, Search, FileClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { getHeldTransactionCount } from "@/lib/db/queries/sales";
import { cn } from "@/lib/utils";

export function POSLayoutHeader() {
  const router = useRouter();

  const { data: heldSalesCountData } = useQuery({
    queryKey: ['heldTransactionsCount'],
    queryFn: () => getHeldTransactionCount()
  });
  const heldSalesCount = heldSalesCountData || 0;

  return (
    <header
      className="h-auto min-h-16 py-3 bg-background flex items-center justify-between px-4 sm:px-6 sticky z-40 border-b border-border/50 before:absolute before:inset-x-0 before:bottom-full before:h-[100vh] before:bg-background before:-z-10"
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
        <span className="text-foreground text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap">
          Point of sale
        </span>
      </div>

      {/* Center: Search (Desktop only) */}
      <div className="hidden sm:flex flex-1 max-w-md mx-4">
        <div className="relative w-full group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          </div>
          <Input
            type="text"
            placeholder="Search products or SKU"
            className="pl-9 pr-4 py-5 bg-muted/30 border-border/50 hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-sm transition-all w-full"
          />
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
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
    </header>
  );
}

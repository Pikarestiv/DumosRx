import { Button } from "@/components/ui/button";
import { Zap, LogOut, PauseCircle, Clock, User } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface POSHeaderProps {
  posMode: "standard" | "speed";
  setPosMode: (mode: "standard" | "speed") => void;
  handleHoldTransaction: () => void;
  cartLength: number;
  setShowHeldDialog: (show: boolean) => void;
}

export function POSHeader({
  posMode,
  setPosMode,
  handleHoldTransaction,
  cartLength,
  setShowHeldDialog,
}: POSHeaderProps) {
  const { t } = useStore();
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif font-bold text-2xl sm:text-3xl text-foreground leading-tight">
          Point of Sale
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Process sales transactions and manage {t("products").toLowerCase()}{" "}
          orders
        </p>
      </div>
      {/* Action buttons — scroll horizontally when they don't fit */}
      <div className="w-full sm:w-auto overflow-x-auto scrollbar-none">
        <TooltipProvider delayDuration={700}>
          <div className="flex items-center gap-2 min-w-max">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={posMode === "standard" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPosMode("standard")}
                  className="cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  Standard View
                </Button>
              </TooltipTrigger>
              <TooltipContent>Detailed view with full product search</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={posMode === "speed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPosMode("speed")}
                  className="cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Zap className="h-4 w-4" />
                  Retail Speed
                </Button>
              </TooltipTrigger>
              <TooltipContent>Optimized for barcode scanning and fast checkout</TooltipContent>
            </Tooltip>
            
            <div className="w-px h-6 bg-border mx-0.5 shrink-0" />
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleHoldTransaction}
                  disabled={cartLength === 0}
                  className="cursor-pointer flex items-center gap-1.5 shrink-0 border-amber-500/20 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400"
                >
                  <PauseCircle className="h-4 w-4" />
                  Hold Sale
                </Button>
              </TooltipTrigger>
              <TooltipContent>Suspend this transaction to recall later</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHeldDialog(true)}
                  className="cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Clock className="h-4 w-4" />
                  Held Sales
                </Button>
              </TooltipTrigger>
              <TooltipContent>View and resume previously held transactions</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border shrink-0">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium max-w-[80px] truncate cursor-default">
                {user?.first_name || user?.username}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0 ml-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={logout}
                  >
                    <LogOut className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out of POS</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}

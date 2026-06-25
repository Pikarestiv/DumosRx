import { Button } from "@/components/ui/button";
import { Zap, LogOut, PauseCircle, Clock, User } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";

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
        <div className="flex items-center gap-2 min-w-max">
          <Button
            variant={posMode === "standard" ? "default" : "outline"}
            size="sm"
            onClick={() => setPosMode("standard")}
            className="cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            Standard View
          </Button>
          <Button
            variant={posMode === "speed" ? "default" : "outline"}
            size="sm"
            onClick={() => setPosMode("speed")}
            className="cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Zap className="h-4 w-4" />
            Retail Speed
          </Button>
          <div className="w-px h-6 bg-border mx-0.5 shrink-0" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleHoldTransaction}
            disabled={cartLength === 0}
            className="cursor-pointer flex items-center gap-1.5 shrink-0 border-amber-500/20 hover:bg-amber-500/5 text-amber-600"
          >
            <PauseCircle className="h-4 w-4" />
            Pause
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHeldDialog(true)}
            className="cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Clock className="h-4 w-4" />
            Held Sales
          </Button>
          <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border shrink-0">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium max-w-[80px] truncate">
              {user?.first_name || user?.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 ml-1"
              onClick={logout}
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

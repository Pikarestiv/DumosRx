import { Button } from "@/components/ui/button";
import { PauseCircle, Clock, Receipt } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { getHeldTransactionCount } from "@/lib/db/queries/sales";
import { Badge } from "@/components/ui/badge";
import { RequestItemDialog } from "./request-item-dialog";

interface POSHeaderProps {
  handleHoldTransaction: () => void;
  cartLength: number;
  setShowHeldDialog: (show: boolean) => void;
  completedTransaction: any;
  setShowReceiptDialog: (show: boolean) => void;
}

export function POSHeader({
  handleHoldTransaction,
  cartLength,
  setShowHeldDialog,
  completedTransaction,
  setShowReceiptDialog,
}: POSHeaderProps) {
  const { t } = useStore();

  const { data: heldSalesCountData } = useQuery({
    queryKey: ['heldTransactionsCount'],
    queryFn: () => getHeldTransactionCount()
  });
  const heldSalesCount = heldSalesCountData || 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-end gap-3 pb-2 border-b border-border/50">
      {/* Action buttons — scroll horizontally when they don't fit */}
      <div className="w-full sm:w-auto overflow-x-auto scrollbar-none">
        <TooltipProvider delayDuration={700}>
          <div className="flex items-center gap-2 min-w-max">
            <RequestItemDialog />

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
              <TooltipContent>
                Suspend this transaction to recall later
              </TooltipContent>
            </Tooltip>

            {completedTransaction && (
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowReceiptDialog(true)}
              >
                <Receipt className="h-4 w-4" />
                Last Receipt
              </Button>
            )}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}

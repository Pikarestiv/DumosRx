import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ReceiptView,
  type ReceiptDocumentType,
  type ReceiptTransaction,
} from "./receipt-view";
import { usePrintReceipt } from "./use-print-receipt";

interface POSReceiptDialogProps {
  showReceiptDialog: boolean;
  setShowReceiptDialog: (show: boolean) => void;
  completedTransaction: ReceiptTransaction | null;
}

export function POSReceiptDialog({
  showReceiptDialog,
  setShowReceiptDialog,
  completedTransaction,
}: POSReceiptDialogProps) {
  const { print, portal, paperSize } = usePrintReceipt();
  const [documentType, setDocumentType] =
    useState<ReceiptDocumentType>("receipt");

  const handlePrint = () => {
    if (completedTransaction) print(completedTransaction, documentType);
  };

  return (
    <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
      <DialogContent className="max-w-[450px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-row items-center justify-between gap-3 p-6 bg-muted/50 border-b shrink-0 space-y-0">
          <div>
            <DialogTitle>Sale Completed</DialogTitle>
            <DialogDescription>
              Transaction ID:{" "}
              {completedTransaction?.id?.slice(0, 8).toUpperCase()}
            </DialogDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            {(["receipt", "tax"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDocumentType(type)}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
                  documentType === type
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary/50 hover:text-muted",
                )}
              >
                {type === "tax" ? "Tax Invoice" : "Receipt"}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {completedTransaction && (
            <ReceiptView
              transaction={completedTransaction}
              paperSize={paperSize}
              documentType={documentType}
            />
          )}
        </div>

        <div className="flex gap-3 p-6 bg-muted/50 border-t shrink-0">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowReceiptDialog(false)}
          >
            Close
          </Button>
          <Button className="flex-1" onClick={handlePrint}>
            <Receipt className="h-4 w-4 mr-2" />
            Print {documentType === "tax" ? "Tax Invoice" : "Receipt"}
          </Button>
        </div>
      </DialogContent>
      {portal}
    </Dialog>
  );
}

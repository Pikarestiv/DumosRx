import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Receipt } from "lucide-react";
import { ReceiptView } from "./receipt-view";
import { usePrintReceipt } from "./use-print-receipt";

interface POSReceiptDialogProps {
  showReceiptDialog: boolean;
  setShowReceiptDialog: (show: boolean) => void;
  completedTransaction: any;
}

export function POSReceiptDialog({
  showReceiptDialog,
  setShowReceiptDialog,
  completedTransaction,
}: POSReceiptDialogProps) {
  const { print, portal, paperSize } = usePrintReceipt();

  const handlePrint = () => {
    if (completedTransaction) print(completedTransaction);
  };

  return (
    <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
      <DialogContent className="max-w-[450px] p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-muted/50 border-b">
          <DialogTitle>Sale Completed</DialogTitle>
          <DialogDescription>
            Transaction ID:{" "}
            {completedTransaction?.id?.slice(0, 8).toUpperCase()}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {completedTransaction && (
            <ReceiptView
              transaction={completedTransaction}
              paperSize={paperSize}
            />
          )}
        </div>

        <div className="flex gap-3 p-6 bg-muted/50 border-t">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowReceiptDialog(false)}
          >
            Close
          </Button>
          <Button className="flex-1" onClick={handlePrint}>
            <Receipt className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
        </div>
      </DialogContent>
      {portal}
    </Dialog>
  );
}

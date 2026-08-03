import React from "react";
import { CameraScannerDialog } from "./camera-scanner-dialog";
import { POSPaymentDialog } from "./pos-payment-dialog";
import { POSReceiptDialog } from "./pos-receipt-dialog";
import { ReturnDialog } from "./return-dialog";
import { HeldTransactionsDialog } from "./held-transactions-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Customer } from "@/lib/hooks/use-pos-data";
import type { ReceiptTransaction } from "./receipt-view";
import type { PaymentAccount } from "@/lib/types/payment-account";

type PaymentMethod = "cash" | "card" | "transfer" | "credit" | "mixed";
type PaymentSplit = { method: string; amount: number; accountId?: string };

interface POSDialogsProps {
  isMobileScannerOpen: boolean;
  setIsMobileScannerOpen: (open: boolean) => void;
  handleScanSuccess: (scannedBarcode: string) => void;
  showPaymentDialog: boolean;
  setShowPaymentDialog: (show: boolean) => void;
  total: number;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  paymentSplits: PaymentSplit[];
  setPaymentSplits: (splits: PaymentSplit[]) => void;
  processingPayment: boolean;
  handlePayment: () => void;
  selectedCustomer: Customer | null;
  currencyCode?: string;
  requirePaymentAccount: boolean;
  enabledPaymentMethods: string[];
  paymentAccounts: PaymentAccount[];
  showReceiptDialog: boolean;
  setShowReceiptDialog: (show: boolean) => void;
  completedTransaction: ReceiptTransaction | null;
  showReturnDialog: boolean;
  setShowReturnDialog: (show: boolean) => void;
  saleToReturn: any;
  refetchProducts: () => void;
  refetchSales: () => void;
  toast: any;
  showHeldDialog: boolean;
  setShowHeldDialog: (show: boolean) => void;
  handleRecallTransaction: any;
  showClearCartDialog: boolean;
  setShowClearCartDialog: (show: boolean) => void;
  clearCart: () => void;
}

export function POSDialogs({
  isMobileScannerOpen,
  setIsMobileScannerOpen,
  handleScanSuccess,
  showPaymentDialog,
  setShowPaymentDialog,
  total,
  paymentMethod,
  setPaymentMethod,
  amountPaid,
  setAmountPaid,
  selectedAccountId,
  setSelectedAccountId,
  paymentSplits,
  setPaymentSplits,
  processingPayment,
  handlePayment,
  selectedCustomer,
  currencyCode,
  requirePaymentAccount,
  enabledPaymentMethods,
  paymentAccounts,
  showReceiptDialog,
  setShowReceiptDialog,
  completedTransaction,
  showReturnDialog,
  setShowReturnDialog,
  saleToReturn,
  refetchProducts,
  refetchSales,
  toast,
  showHeldDialog,
  setShowHeldDialog,
  handleRecallTransaction,
  showClearCartDialog,
  setShowClearCartDialog,
  clearCart,
}: POSDialogsProps) {
  return (
    <>
      <CameraScannerDialog
        isOpen={isMobileScannerOpen}
        onClose={() => setIsMobileScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
      <POSPaymentDialog
        showPaymentDialog={showPaymentDialog}
        setShowPaymentDialog={setShowPaymentDialog}
        total={total}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        amountPaid={amountPaid}
        setAmountPaid={setAmountPaid}
        selectedAccountId={selectedAccountId}
        setSelectedAccountId={setSelectedAccountId}
        paymentSplits={paymentSplits}
        setPaymentSplits={setPaymentSplits}
        processingPayment={processingPayment}
        handlePayment={handlePayment}
        selectedCustomer={selectedCustomer}
        currencyCode={currencyCode}
        requirePaymentAccount={requirePaymentAccount}
        enabledPaymentMethods={enabledPaymentMethods}
        paymentAccounts={paymentAccounts}
      />
      <POSReceiptDialog
        showReceiptDialog={showReceiptDialog}
        setShowReceiptDialog={setShowReceiptDialog}
        completedTransaction={completedTransaction}
      />
      <ReturnDialog
        open={showReturnDialog}
        onOpenChange={setShowReturnDialog}
        sale={saleToReturn}
        onSuccess={() => {
          refetchProducts();
          refetchSales();
          toast.success("Stock Batch updated after return");
        }}
        currencyCode={currencyCode}
      />
      <HeldTransactionsDialog
        isOpen={showHeldDialog}
        onClose={() => setShowHeldDialog(false)}
        onRecall={handleRecallTransaction}
      />
      <ConfirmDialog
        open={showClearCartDialog}
        onOpenChange={setShowClearCartDialog}
        title="Clear Cart?"
        description="All items in the current cart will be removed. This cannot be undone."
        confirmLabel="Clear Cart"
        onConfirm={() => {
          clearCart();
          setShowClearCartDialog(false);
        }}
      />
    </>
  );
}

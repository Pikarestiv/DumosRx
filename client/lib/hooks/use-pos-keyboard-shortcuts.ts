import { useEffect } from "react";
import { toast } from "sonner";
import { Customer } from "./use-pos-data";

interface UsePOSKeyboardShortcutsProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  cartLength: number;
  selectedCustomer: Customer | null;
  showPaymentDialog: boolean;
  setShowPaymentDialog: (show: boolean) => void;
  showReceiptDialog: boolean;
  setShowReceiptDialog: (show: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  setShowClearCartDialog: (show: boolean) => void;
  setPaymentMethod: React.Dispatch<
    React.SetStateAction<"cash" | "card" | "transfer" | "credit" | "mixed">
  >;
}

export function usePOSKeyboardShortcuts({
  searchInputRef,
  cartLength,
  selectedCustomer,
  showPaymentDialog,
  setShowPaymentDialog,
  showReceiptDialog,
  setShowReceiptDialog,
  searchTerm,
  setSearchTerm,
  setShowClearCartDialog,
  setPaymentMethod,
}: UsePOSKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (((e.altKey || e.ctrlKey) && e.key === "s") || e.key === "F1") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (cartLength > 0) {
        if (e.key === "F2") {
          e.preventDefault();
          setPaymentMethod("cash");
          setShowPaymentDialog(true);
        }
        if (e.key === "F3") {
          e.preventDefault();
          setPaymentMethod("card");
          setShowPaymentDialog(true);
        }
        if (e.key === "F4") {
          e.preventDefault();
          if (!selectedCustomer) {
            toast.error("Please select a customer for credit sales");
            return;
          }
          setPaymentMethod("credit");
          setShowPaymentDialog(true);
        }
        if (e.key === "F5") {
          e.preventDefault();
          setPaymentMethod("mixed");
          setShowPaymentDialog(true);
        }
      }

      if (e.key === "Escape") {
        if (showPaymentDialog) setShowPaymentDialog(false);
        else if (showReceiptDialog) setShowReceiptDialog(false);
        else if (searchTerm) setSearchTerm("");
        else if (cartLength > 0) {
          setShowClearCartDialog(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cartLength,
    selectedCustomer,
    showPaymentDialog,
    showReceiptDialog,
    searchTerm,
    setShowPaymentDialog,
    setPaymentMethod,
    searchInputRef,
    setSearchTerm,
    setShowClearCartDialog,
    setShowReceiptDialog,
  ]);
}

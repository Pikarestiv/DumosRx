import { useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/context/store-context";
import { usePOSCart } from "@/lib/hooks/use-pos-cart";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import { useSmartSuggestions } from "@/hooks/use-smart-suggestions";
import { usePOSProductFilter } from "@/lib/hooks/use-pos-product-filter";
import { usePOSScan } from "@/lib/hooks/use-pos-scan";
import { getHeldTransactionCount } from "@/lib/db/queries/sales";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { usePOSData, Customer } from "@/lib/hooks/use-pos-data";
import { usePOSPrescription } from "@/lib/hooks/use-pos-prescription";
import { usePOSReturnDeepLink } from "@/lib/hooks/use-pos-return-deep-link";
import { usePOSHeldTransactions } from "@/lib/hooks/use-pos-held-transactions";
import { usePOSKeyboardShortcuts } from "@/lib/hooks/use-pos-keyboard-shortcuts";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import { queryKeys } from "@/lib/query-keys";
import type { SaleWithDetails } from "@/lib/types/sale";

/**
 * Orchestrates every POS business-logic hook (cart, payment, prescriptions,
 * held sales, scanning, keyboard shortcuts, pull-to-refresh) plus the
 * remaining local glue state, so the POSSystem component only has to render
 * what this hook returns.
 */
export function usePOSSystem() {
  const { t, storeProfile, vatPercentage } = useStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = searchParams.get("tab") || "products";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isMobileScannerOpen, setIsMobileScannerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [saleToReturn, setSaleToReturn] = useState<SaleWithDetails | null>(
    null,
  );
  usePOSReturnDeepLink({
    searchParams,
    router,
    pathname,
    setSaleToReturn,
    setShowReturnDialog,
  });
  const [showHeldDialog, setShowHeldDialog] = useState(false);
  const [showClearCartDialog, setShowClearCartDialog] = useState(false);
  const { data: heldSalesCountData } = useQuery({
    ...queryKeys.heldTransactions.count(),
    queryFn: () => getHeldTransactionCount(),
  });
  const heldSalesCount = heldSalesCountData || 0;
  const {
    products,
    loadingProducts,
    refetchProducts,
    recentSales,
    refetchSales,
    recentlySoldIds,
    commonlySoldIds,
    customers,
    loadingCustomers,
    paymentAccounts,
  } = usePOSData();

  // POS doesn't use the shared DashboardLayout scroll container (its routes opt out
  // of that entirely), so each tab wires pull-to-refresh directly onto its own
  // scrollable region instead of registering through the global context.
  const productsPullToRefresh = usePullToRefresh<HTMLDivElement>({
    onRefresh: async () => {
      await refetchProducts();
    },
  });
  const historyPullToRefresh = usePullToRefresh<HTMLDivElement>({
    onRefresh: async () => {
      await refetchSales();
    },
  });
  const {
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    restoreCart,
    subtotal,
    tax,
    total,
    discount,
    discountType,
    calculatedDiscount,
    setDiscount,
    setDiscountType,
    redeemedOption,
    redeemReward,
    clearRedemption,
  } = usePOSCart(products);
  const { canUseSmartSuggestions, withRestriction } = useFeatureGate();
  const { suggestions } = useSmartSuggestions(cart, products);
  const requirePaymentAccount = storeProfile?.require_payment_account === 1;
  const requireSaleNotes = storeProfile?.require_sale_notes === 1;
  let enabledPaymentMethods = ["cash", "card", "transfer", "credit", "mixed"];
  try {
    if (storeProfile?.enabled_payment_methods)
      enabledPaymentMethods = JSON.parse(storeProfile.enabled_payment_methods);
  } catch (_e) {}
  const { dispensedRxId, setDispensedRxId, isRefillDispense } = usePOSPrescription({
    searchParams,
    products,
    cartLength: cart.length,
    restoreCart,
    router,
    pathname,
  });
  const {
    paymentMethod, setPaymentMethod, amountPaid, setAmountPaid,
    selectedAccountId, setSelectedAccountId, paymentSplits, setPaymentSplits,
    saleNote, setSaleNote,
    processingPayment, handlePayment, completedTransaction,
    showPaymentDialog, setShowPaymentDialog, showReceiptDialog, setShowReceiptDialog,
  } = usePOSPayment({
    cart,
    subtotal,
    tax,
    total,
    discount: calculatedDiscount,
    rawDiscount: discount,
    discountType,
    redeemedOption,
    selectedCustomer,
    setSelectedCustomer,
    clearCart,
    refetchProducts,
    refetchSales,
    requirePaymentAccount,
    requireSaleNotes,
    dispensedRxId,
    setDispensedRxId,
    isRefillDispense,
  });
  usePOSKeyboardShortcuts({
    searchInputRef,
    cartLength: cart.length,
    selectedCustomer,
    showPaymentDialog,
    setShowPaymentDialog,
    showReceiptDialog,
    setShowReceiptDialog,
    searchTerm,
    setSearchTerm,
    setShowClearCartDialog,
    setPaymentMethod,
  });
  const { handleHoldTransaction, handleRecallTransaction } =
    usePOSHeldTransactions({
      cart,
      total,
      discount,
      discountType,
      selectedCustomer,
      clearCart,
      setSelectedCustomer,
      products,
      restoreCart,
      customers,
      setShowHeldDialog,
    });
  const { categories, filteredProducts, isFuzzyFallback } = usePOSProductFilter(
    products,
    searchTerm,
    categoryFilter,
  );
  const { handleKeyPress, handleScanSuccess } = usePOSScan({
    products,
    searchTerm,
    setSearchTerm,
    addToCart,
  });

  const isPrescriptionLocked = !!dispensedRxId;
  const handleEditPrescription = isPrescriptionLocked
    ? () => router.push(`/prescriptions?action=add&edit_rx=${dispensedRxId}`)
    : undefined;
  const handleAddToCart = isPrescriptionLocked
    ? () => toast.info("Cart is locked to this prescription. Edit the prescription to change medications.")
    : addToCart;

  return {
    t,
    storeProfile,
    vatPercentage,
    searchInputRef,
    activeTab,
    handleTabChange,
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    isMobileScannerOpen,
    setIsMobileScannerOpen,
    selectedCustomer,
    setSelectedCustomer,
    showReturnDialog,
    setShowReturnDialog,
    saleToReturn,
    setSaleToReturn,
    showHeldDialog,
    setShowHeldDialog,
    showClearCartDialog,
    setShowClearCartDialog,
    heldSalesCount,
    products,
    loadingProducts,
    refetchProducts,
    recentSales,
    refetchSales,
    recentlySoldIds,
    commonlySoldIds,
    customers,
    loadingCustomers,
    paymentAccounts,
    productsPullToRefresh,
    historyPullToRefresh,
    cart,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    tax,
    total,
    discount,
    discountType,
    calculatedDiscount,
    setDiscount,
    setDiscountType,
    redeemedOption,
    redeemReward,
    clearRedemption,
    canUseSmartSuggestions,
    withRestriction,
    suggestions,
    requirePaymentAccount,
    requireSaleNotes,
    enabledPaymentMethods,
    paymentMethod, setPaymentMethod, amountPaid, setAmountPaid,
    selectedAccountId, setSelectedAccountId, paymentSplits, setPaymentSplits,
    saleNote, setSaleNote,
    processingPayment, handlePayment, completedTransaction,
    showPaymentDialog, setShowPaymentDialog, showReceiptDialog, setShowReceiptDialog,
    handleHoldTransaction, handleRecallTransaction,
    categories, filteredProducts, isFuzzyFallback,
    handleKeyPress, handleScanSuccess,
    isPrescriptionLocked,
    handleEditPrescription,
    handleAddToCart,
  };
}

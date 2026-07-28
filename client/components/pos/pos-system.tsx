"use client";
import React, { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useStore } from "@/lib/context/store-context";
import { usePOSCart } from "@/lib/hooks/use-pos-cart";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import { useSmartSuggestions } from "@/hooks/use-smart-suggestions";
import { usePOSProductFilter } from "@/lib/hooks/use-pos-product-filter";
import { usePOSScan } from "@/lib/hooks/use-pos-scan";
import { POSLayoutHeader } from "./pos-layout-header";
import { useQuery } from "@tanstack/react-query";
import { getHeldTransactionCount } from "@/lib/db/queries/sales";
import { POSProductList } from "./pos-product-list";
import { POSCategoryFilter } from "./pos-category-filter";
import { POSMainTabNav } from "./pos-main-tab-nav";
import { POSTransactionHistory } from "./pos-transaction-history";
import { POSMobileSearch } from "./pos-mobile-search";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { POSDialogs } from "./pos-dialogs";
import { POSCartPanels } from "./pos-cart-panels";
import { usePOSData, Customer } from "@/lib/hooks/use-pos-data";
import { usePOSPrescription } from "@/lib/hooks/use-pos-prescription";
import { usePOSReturnDeepLink } from "@/lib/hooks/use-pos-return-deep-link";
import { usePOSHeldTransactions } from "@/lib/hooks/use-pos-held-transactions";
import { usePOSKeyboardShortcuts } from "@/lib/hooks/use-pos-keyboard-shortcuts";
export function POSSystem() {
  const { t, storeProfile, vatPercentage } = useStore();
  const searchInputRef = React.useRef<HTMLInputElement>(null);
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
  const [saleToReturn, setSaleToReturn] = useState<any>(null);
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
    queryKey: ["heldTransactionsCount"],
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
  } = usePOSCart(products);
  const { canUseSmartSuggestions, withRestriction } = useFeatureGate();
  const { suggestions } = useSmartSuggestions(cart, products);
  const requirePaymentAccount = storeProfile?.require_payment_account === 1;
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
    selectedCustomer,
    setSelectedCustomer,
    clearCart,
    refetchProducts,
    refetchSales,
    requirePaymentAccount,
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

  const posDialogProps = {
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
    currencyCode: storeProfile?.currency,
    requirePaymentAccount,
    enabledPaymentMethods,
    paymentAccounts: paymentAccounts || [],
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
  };

  return (
    <div
      className="flex flex-col lg:flex-row w-full overflow-hidden bg-background"
      style={{ height: "calc(100dvh - var(--tauri-top, 0px))" }}
    >
      {/* Left: header + tabs/products (full width on mobile, shrinks to make room for the cart on desktop) */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <POSLayoutHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onKeyDown={handleKeyPress}
          searchInputRef={searchInputRef}
          heldSalesCount={heldSalesCount}
          onOpenHeldSales={() => setShowHeldDialog(true)}
          onScanSuccess={handleScanSuccess}
        />

        <div className="p-4 sm:p-6 sm:pt-3 sm:py-4 flex-1 overflow-hidden flex flex-col">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-none flex mb-2 sm:mb-4">
              <POSMainTabNav />
            </div>
            <div className="flex-1 overflow-hidden relative">
              <TabsContent
                value="products"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1 flex flex-col gap-4"
              >
                <POSCategoryFilter
                  categories={categories}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                />

                {/* Mobile specific Customer Selector & Search */}
                <POSMobileSearch
                  selectedCustomer={selectedCustomer}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                  onSelectCustomer={setSelectedCustomer as any}
                  cartLength={cart.length}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  handleKeyPress={handleKeyPress}
                  setIsMobileScannerOpen={setIsMobileScannerOpen}
                />

                <POSProductList
                  loadingProducts={loadingProducts}
                  filteredProducts={filteredProducts}
                  isFuzzyFallback={isFuzzyFallback}
                  addToCart={handleAddToCart}
                  productTerm={t("product")}
                  searchTerm={searchTerm}
                  currencyCode={storeProfile?.currency}
                  suggestions={suggestions}
                  recentlySoldIds={recentlySoldIds}
                  commonlySoldIds={commonlySoldIds}
                  cart={cart}
                  canUseSmartSuggestions={canUseSmartSuggestions}
                  onUpgradeClick={withRestriction(() => {}, {
                    featureAllowed: canUseSmartSuggestions,
                    featureKey: "smart_suggestions",
                  })}
                />
              </TabsContent>
              <TabsContent
                value="history"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1"
              >
                <POSTransactionHistory
                  recentSales={recentSales}
                  onReturnClick={(sale) => {
                    setSaleToReturn(sale);
                    setShowReturnDialog(true);
                  }}
                  currencyCode={storeProfile?.currency}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Right: customer + cart, full page height (Desktop only) */}
      <POSCartPanels
        cart={cart}
        subtotal={subtotal}
        tax={tax}
        total={total}
        discount={discount}
        calculatedDiscount={calculatedDiscount}
        discountType={discountType}
        setDiscount={setDiscount}
        setDiscountType={setDiscountType}
        vatPercentage={vatPercentage}
        currencyCode={storeProfile?.currency}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        onCheckout={withRestriction(() => setShowPaymentDialog(true))}
        onHoldSale={handleHoldTransaction}
        heldSalesCount={heldSalesCount}
        onOpenHeldSales={() => setShowHeldDialog(true)}
        isPrescriptionLocked={isPrescriptionLocked}
        onEditPrescription={handleEditPrescription}
        selectedCustomer={selectedCustomer}
        customers={customers}
        loadingCustomers={loadingCustomers}
        onSelectCustomer={setSelectedCustomer as any}
      />
      <POSDialogs {...posDialogProps} />
    </div>
  );
}

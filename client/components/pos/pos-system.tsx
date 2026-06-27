"use client";

import React, { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/context/store-context";
import { usePOSCart } from "@/lib/hooks/use-pos-cart";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import { useSmartSuggestions } from "@/hooks/use-smart-suggestions";
import { searchProducts } from "@/lib/utils/search";

// UI Components
import { POSHeader } from "./pos-header";
import { POSSearchCard } from "./pos-search-card";
import { POSProductList } from "./pos-product-list";
import { POSTransactionHistory } from "./pos-transaction-history";
import { POSCustomerSelector } from "./pos-customer-selector";
import { POSCart } from "./pos-cart";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { RetailSpeedPOS } from "./retail-speed-pos";
import { POSPaymentDialog } from "./pos-payment-dialog";
import { POSReceiptDialog } from "./pos-receipt-dialog";
import { ReturnDialog } from "./return-dialog";
import { HeldTransactionsDialog } from "./held-transactions-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Custom Hooks
import { usePOSData, Customer } from "@/lib/hooks/use-pos-data";
import { usePOSPrescription } from "@/lib/hooks/use-pos-prescription";
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
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [posMode, setPosMode] = useState<"standard" | "speed">("standard");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [saleToReturn, setSaleToReturn] = useState<any>(null);
  const [showHeldDialog, setShowHeldDialog] = useState(false);
  const [showClearCartDialog, setShowClearCartDialog] = useState(false);

  // 1. Fetch Data
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

  // 2. Cart Logic
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
  } = usePOSCart(products);

  // 3. Suggestions
  const { withRestriction } = useFeatureGate();
  const { suggestions } = useSmartSuggestions(cart, products);

  // 4. Payment Config
  const requirePaymentAccount = storeProfile?.require_payment_account === 1;
  let enabledPaymentMethods = ["cash", "card", "transfer", "credit", "mixed"];
  try {
    if (storeProfile?.enabled_payment_methods) {
      enabledPaymentMethods = JSON.parse(storeProfile.enabled_payment_methods);
    }
  } catch (_e) {
    // default
  }

  // 4.5. Dispense Prescription Logic
  const { dispensedRxId, setDispensedRxId } = usePOSPrescription({
    searchParams,
    products,
    cartLength: cart.length,
    restoreCart,
    router,
    pathname,
  });

  // 5. Payment Logic
  const {
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
    completedTransaction,
    showPaymentDialog,
    setShowPaymentDialog,
    showReceiptDialog,
    setShowReceiptDialog,
  } = usePOSPayment({
    cart,
    subtotal,
    tax,
    total,
    discount,
    selectedCustomer,
    clearCart,
    refetchProducts,
    refetchSales,
    requirePaymentAccount,
    dispensedRxId,
    setDispensedRxId,
  });

  // 7. Keyboard Shortcuts Logic
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

  // 8. Held Transactions Logic
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

  // 9. Search & Filter
  const { results: filteredProducts, isFuzzyFallback } = React.useMemo(() => {
    return searchProducts(searchTerm, products);
  }, [searchTerm, products]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      handleScanSuccess(searchTerm.trim());
    }
  };

  const handleScanSuccess = (scannedBarcode: string) => {
    const query = scannedBarcode.toLowerCase().trim();
    const barcodeMatch = products.find(
      (m) =>
        m.barcode?.toLowerCase() === query ||
        m.batch_number?.toLowerCase() === query,
    );

    if (barcodeMatch) {
      addToCart(barcodeMatch);
      setSearchTerm("");
      toast.success(`Scanned: ${barcodeMatch.name}`);
    } else {
      toast.error(`No product found for barcode: ${scannedBarcode}`);
    }
  };

  return (
    <div className="space-y-4">
      <POSHeader
        posMode={posMode}
        setPosMode={setPosMode}
        handleHoldTransaction={handleHoldTransaction}
        cartLength={cart.length}
        setShowHeldDialog={setShowHeldDialog}
      />

      {posMode === "speed" ? (
        <RetailSpeedPOS
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          total={total}
          vatPercentage={vatPercentage}
          currencyCode={storeProfile?.currency}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filteredProducts={filteredProducts}
          isFuzzyFallback={isFuzzyFallback}
          addToCart={addToCart}
          updateQuantity={updateQuantity}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          selectedCustomer={selectedCustomer}
          setPaymentMethod={setPaymentMethod}
          setShowPaymentDialog={setShowPaymentDialog}
        />
      ) : (
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Left: product search + list */}
          <div className="lg:col-span-2 space-y-4">
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <div className="overflow-x-auto scrollbar-none">
                <TabsList className="w-max min-w-full bg-muted/50 p-1 flex mb-4">
                  <TabsTrigger value="products" className="px-4 py-2 shrink-0">
                    Products
                  </TabsTrigger>
                  <TabsTrigger value="history" className="px-4 py-2 shrink-0">
                    Recent Transactions
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="products" className="space-y-4">
                <POSSearchCard
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  onScanSuccess={handleScanSuccess}
                  onKeyDown={handleKeyPress}
                  searchInputRef={searchInputRef}
                  completedTransaction={completedTransaction}
                  setShowReceiptDialog={setShowReceiptDialog}
                  productTerm={t("product")}
                />

                <POSProductList
                  loadingProducts={loadingProducts}
                  filteredProducts={filteredProducts}
                  isFuzzyFallback={isFuzzyFallback}
                  productsLength={products.length}
                  addToCart={addToCart}
                  productTerm={t("product")}
                  currencyCode={storeProfile?.currency}
                  suggestions={suggestions}
                  recentlySoldIds={recentlySoldIds}
                  commonlySoldIds={commonlySoldIds}
                />
              </TabsContent>

              <TabsContent value="history">
                <POSTransactionHistory
                  recentSales={recentSales}
                  onReturnClick={(sale) => {
                    setSaleToReturn(sale);
                    setShowReturnDialog(true);
                  }}
                  currencyCode={storeProfile?.currency}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right (or bottom on mobile): customer + cart */}
          <div className="space-y-4">
            <POSCustomerSelector
              selectedCustomer={selectedCustomer}
              customers={customers}
              loadingCustomers={loadingCustomers}
              onSelectCustomer={setSelectedCustomer as any}
            />

            <POSCart
              cart={cart}
              subtotal={subtotal}
              tax={tax}
              total={total}
              discount={discount}
              vatPercentage={vatPercentage}
              currencyCode={storeProfile?.currency}
              updateQuantity={updateQuantity}
              removeFromCart={removeFromCart}
              clearCart={clearCart}
              onCheckout={withRestriction(() => setShowPaymentDialog(true))}
            />
          </div>
        </div>
      )}

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
        currencyCode={storeProfile?.currency}
        requirePaymentAccount={requirePaymentAccount}
        enabledPaymentMethods={enabledPaymentMethods}
        paymentAccounts={paymentAccounts || []}
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
          toast.success("StockBatch updated after return");
        }}
        currencyCode={storeProfile?.currency}
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
    </div>
  );
}

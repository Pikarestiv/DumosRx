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
import { POSLayoutHeader } from "./pos-layout-header";
import { useQuery } from "@tanstack/react-query";
import { getHeldTransactionCount } from "@/lib/db/queries/sales";
import { POSProductList } from "./pos-product-list";
import { POSTransactionHistory } from "./pos-transaction-history";
import { POSCustomerSelector } from "./pos-customer-selector";
import { POSCart } from "./pos-cart";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { POSPaymentDialog } from "./pos-payment-dialog";
import { POSReceiptDialog } from "./pos-receipt-dialog";
import { ReturnDialog } from "./return-dialog";
import { HeldTransactionsDialog } from "./held-transactions-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { POSMobileCartDrawer } from "./pos-mobile-cart-drawer";

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
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [saleToReturn, setSaleToReturn] = useState<any>(null);
  const [showHeldDialog, setShowHeldDialog] = useState(false);
  const [showClearCartDialog, setShowClearCartDialog] = useState(false);

  // 1. Fetch Data
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
    discountType,
    calculatedDiscount,
    setDiscount,
    setDiscountType,
  } = usePOSCart(products);

  // 3. Suggestions
  const { canUseSmartSuggestions, canUseMobileApp, withRestriction } =
    useFeatureGate();
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
    discount: calculatedDiscount,
    rawDiscount: discount,
    discountType,
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
    <div className="flex flex-col w-full h-screen overflow-hidden bg-background">
      <POSLayoutHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onKeyDown={handleKeyPress}
        searchInputRef={searchInputRef}
        heldSalesCount={heldSalesCount}
        onOpenHeldSales={() => setShowHeldDialog(true)}
        onScanSuccess={handleScanSuccess}
      />
      <div className="p-4 sm:p-6 sm:pt-3 flex-1 overflow-hidden flex flex-col">
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full flex-1 flex flex-col lg:grid lg:grid-cols-3 gap-4 lg:gap-6 overflow-hidden"
        >
          {/* Left: TabsList + product search + list */}
          <div className="lg:col-span-2 flex flex-col overflow-hidden h-full">
            <div className="flex-none flex pb-2 mb-2 sm:mb-4">
              <TabsList className="w-auto">
                <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="history">Recent Sales</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <TabsContent
                value="products"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1"
              >
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
          </div>

          {/* Right: customer + cart (Hidden on Mobile) */}
          <div className="hidden lg:flex flex-col bg-background border border-border lg:rounded-2xl shadow-sm overflow-hidden h-full">
            <POSCustomerSelector
              selectedCustomer={selectedCustomer}
              customers={customers}
              loadingCustomers={loadingCustomers}
              onSelectCustomer={setSelectedCustomer as any}
              cartLength={cart.length}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
              <POSCart
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
              />
            </div>
          </div>
        </Tabs>

        {/* Mobile Cart Trigger */}
        {cart.length > 0 && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
            <POSMobileCartDrawer
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
              selectedCustomer={selectedCustomer}
              customers={customers}
              loadingCustomers={loadingCustomers}
              onSelectCustomer={setSelectedCustomer as any}
            />
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
            toast.success("Stock Batch updated after return");
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
    </div>
  );
}

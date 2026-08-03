"use client";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { usePOSSystem } from "@/lib/hooks/use-pos-system";
import { POSLayoutHeader } from "./pos-layout-header";
import { POSProductList } from "./pos-product-list";
import { POSCategoryFilter } from "./pos-category-filter";
import { POSMainTabNav } from "./pos-main-tab-nav";
import { POSTransactionHistory } from "./pos-transaction-history";
import { POSMobileSearch } from "./pos-mobile-search";
import { POSDialogs } from "./pos-dialogs";
import { POSCartPanels } from "./pos-cart-panels";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh-indicator";

export function POSSystem() {
  const {
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
    canUseSmartSuggestions,
    withRestriction,
    suggestions,
    requirePaymentAccount,
    enabledPaymentMethods,
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
    handleHoldTransaction,
    handleRecallTransaction,
    categories,
    filteredProducts,
    isFuzzyFallback,
    handleKeyPress,
    handleScanSuccess,
    isPrescriptionLocked,
    handleEditPrescription,
    handleAddToCart,
  } = usePOSSystem();

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
                ref={productsPullToRefresh.scrollRef}
                value="products"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1 flex flex-col gap-4"
              >
                <PullToRefreshIndicator
                  pullDistance={productsPullToRefresh.pullDistance}
                  isRefreshing={productsPullToRefresh.isRefreshing}
                  threshold={productsPullToRefresh.threshold}
                />
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
                  onSelectCustomer={setSelectedCustomer}
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
                ref={historyPullToRefresh.scrollRef}
                value="history"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1"
              >
                <PullToRefreshIndicator
                  pullDistance={historyPullToRefresh.pullDistance}
                  isRefreshing={historyPullToRefresh.isRefreshing}
                  threshold={historyPullToRefresh.threshold}
                />
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
        onSelectCustomer={setSelectedCustomer}
      />
      <POSDialogs {...posDialogProps} />
    </div>
  );
}

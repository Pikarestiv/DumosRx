"use client";
import { useCallback, useState } from "react";
import type { SaleWithDetails } from "@/lib/types/sale";
import type { POSProduct } from "@/lib/types/product";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { usePOSSystem } from "@/lib/hooks/use-pos-system";
import { POSLayoutHeader } from "./pos-layout-header";
import { POSProductList } from "./pos-product-list";
import { POSServiceList } from "./pos-service-list";
import { POSCategoryFilter } from "./pos-category-filter";
import { POSMainTabNav } from "./pos-main-tab-nav";
import { POSTransactionHistory } from "./pos-transaction-history";
import { POSMobileSearch } from "./pos-mobile-search";
import { POSDialogs } from "./pos-dialogs";
import { POSCartPanels } from "./pos-cart-panels";
import { SpotSourceDialog } from "./spot-source-dialog";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh-indicator";
import { useHasPermission } from "@/lib/hooks/use-permissions";

export function POSSystem() {
  const {
    t, storeProfile, vatPercentage, searchInputRef, activeTab, handleTabChange,
    searchTerm, setSearchTerm, categoryFilter, setCategoryFilter,
    isMobileScannerOpen, setIsMobileScannerOpen, selectedCustomer, setSelectedCustomer,
    showReturnDialog, setShowReturnDialog, saleToReturn, setSaleToReturn,
    showHeldDialog, setShowHeldDialog, showClearCartDialog, setShowClearCartDialog,
    heldSalesCount, services, loadingServices, loadingProducts, productsLoadFailed,
    refetchProducts, recentSales, refetchSales, recentlySoldIds, commonlySoldIds,
    customers, loadingCustomers, paymentAccounts,
    productsPullToRefresh: {
      scrollRef: productsScrollRef,
      pullDistance: productsPullDistance,
      isRefreshing: productsIsRefreshing,
      threshold: productsPullThreshold,
    },
    historyPullToRefresh: {
      scrollRef: historyScrollRef,
      pullDistance: historyPullDistance,
      isRefreshing: historyIsRefreshing,
      threshold: historyPullThreshold,
    },
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
    isResellerSale,
    setIsResellerSale,
    markupType,
    setMarkupType,
    updateUnitPrice,
    updateSpotSourcing,
    canUseSmartSuggestions,
    withRestriction,
    suggestions,
    requirePaymentAccount,
    requireSaleNotes,
    enabledPaymentMethods,
    paymentMethod,
    setPaymentMethod,
    amountPaid,
    setAmountPaid,
    selectedAccountId,
    setSelectedAccountId,
    paymentSplits,
    setPaymentSplits,
    saleNote,
    setSaleNote,
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
    addServiceToCart,
    spotSourceProduct,
    setSpotSourceProduct,
    handleSpotSourceConfirm,
  } = usePOSSystem();

  // The Recent Sales tab is reachable by URL (?tab=history), so the panel and the resolved tab are gated here as well as the…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-system-tsx-L109
  const canViewSalesHistory = useHasPermission("view_sales_history");
  const resolvedTab = canViewSalesHistory ? activeTab : "products";

  // Stable: this is a prop of every virtualized transaction row, and a fresh
  // arrow here would re-render all of them on any POS state change.
  const handleReturnClick = useCallback(
    (sale: SaleWithDetails) => {
      setSaleToReturn(sale);
      setShowReturnDialog(true);
    },
    [setSaleToReturn, setShowReturnDialog],
  );

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
    saleNote,
    setSaleNote,
    processingPayment,
    handlePayment,
    selectedCustomer,
    currencyCode: storeProfile?.currency,
    requirePaymentAccount,
    requireSaleNotes,
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
    showHeldDialog,
    setShowHeldDialog,
    handleRecallTransaction,
    showClearCartDialog,
    setShowClearCartDialog,
    clearCart,
    cartLength: cart.length,
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
          searchPlaceholder={
            resolvedTab === "services"
              ? "Search services (e.g. massage, styling)..."
              : undefined
          }
        />

        <div className="p-4 sm:p-6 sm:pt-3 sm:py-4 flex-1 overflow-hidden flex flex-col">
          <Tabs
            value={resolvedTab}
            onValueChange={handleTabChange}
            className="w-full flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-none flex mb-2 sm:mb-4">
              <POSMainTabNav />
            </div>
            <div className="flex-1 overflow-hidden relative">
              <TabsContent
                ref={productsScrollRef}
                value="products"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1 flex flex-col gap-4"
              >
                <PullToRefreshIndicator
                  pullDistance={productsPullDistance}
                  isRefreshing={productsIsRefreshing}
                  threshold={productsPullThreshold}
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
                  productsLoadFailed={productsLoadFailed}
                  onRetryLoadProducts={() => void refetchProducts()}
                  filteredProducts={filteredProducts}
                  isFuzzyFallback={isFuzzyFallback}
                  addToCart={handleAddToCart}
                  scrollElementRef={productsScrollRef}
                  productTerm={t("product")}
                  searchTerm={searchTerm}
                  currencyCode={storeProfile?.currency}
                  displayStockLevels={storeProfile?.display_stock_levels !== 0}
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
                value="services"
                className="absolute inset-0 overflow-y-auto mt-0 pr-1 flex flex-col gap-4"
              >
                <POSServiceList
                  services={services}
                  loadingServices={loadingServices}
                  addToCart={addServiceToCart}
                  currencyCode={storeProfile?.currency}
                  cart={cart}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  onClearSearch={() => setSearchTerm("")}
                />
              </TabsContent>
              {canViewSalesHistory && (
                <TabsContent
                  ref={historyScrollRef}
                  value="history"
                  className="absolute inset-0 overflow-y-auto mt-0 pr-1"
                >
                  <PullToRefreshIndicator
                    pullDistance={historyPullDistance}
                    isRefreshing={historyIsRefreshing}
                    threshold={historyPullThreshold}
                  />
                  <POSTransactionHistory
                    recentSales={recentSales}
                    onReturnClick={handleReturnClick}
                    currencyCode={storeProfile?.currency}
                    scrollElementRef={historyScrollRef}
                  />
                </TabsContent>
              )}
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
        redeemedOption={redeemedOption}
        onRedeemReward={redeemReward}
        onClearRedemption={clearRedemption}
        vatPercentage={vatPercentage}
        currencyCode={storeProfile?.currency}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        onRequestClearCart={() => setShowClearCartDialog(true)}
        onCheckout={withRestriction(() => setShowPaymentDialog(true))}
        onHoldSale={() => void handleHoldTransaction()}
        heldSalesCount={heldSalesCount}
        onOpenHeldSales={() => setShowHeldDialog(true)}
        isPrescriptionLocked={isPrescriptionLocked}
        onEditPrescription={handleEditPrescription}
        isResellerSale={isResellerSale}
        setIsResellerSale={setIsResellerSale}
        markupType={markupType}
        setMarkupType={setMarkupType}
        updateUnitPrice={updateUnitPrice}
        updateSpotSourcing={updateSpotSourcing}
        selectedCustomer={selectedCustomer}
        customers={customers}
        loadingCustomers={loadingCustomers}
        onSelectCustomer={setSelectedCustomer}
      />
      <POSDialogs {...posDialogProps} />
      <SpotSourceDialog
        open={spotSourceProduct !== null}
        onOpenChange={(open) => !open && setSpotSourceProduct(null)}
        product={spotSourceProduct}
        currencyCode={storeProfile?.currency}
        onConfirm={handleSpotSourceConfirm}
      />
    </div>
  );
}

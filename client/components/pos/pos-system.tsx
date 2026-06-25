"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, User, Zap, LogOut, PauseCircle, Clock } from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

interface Medicine {
  id: string;
  name: string;
  generic_name: string;
  brand: string;
  strength: string;
  unit_price: number;
  stock: number;
  cost_price?: number;
  barcode?: string;
  batch_number?: string;
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
  outstanding_balance: number;
}

import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { ReceiptView } from "./receipt-view";
import React from "react";

import { usePOSCart } from "@/lib/hooks/use-pos-cart";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import { POSProductList } from "./pos-product-list";
import { POSPaymentDialog } from "./pos-payment-dialog";
import { RetailSpeedPOS } from "./retail-speed-pos";
import { ReturnDialog } from "./return-dialog";
import { POSSearchCard } from "./pos-search-card";
import { POSTransactionHistory } from "./pos-transaction-history";
import { POSCustomerSelector } from "./pos-customer-selector";
import { POSCart } from "./pos-cart";
import { useSmartSuggestions } from "@/hooks/use-smart-suggestions";
import { HeldTransactionsDialog } from "./held-transactions-dialog";
import { insert, remove, query } from "@/lib/db/local-database";
import { searchMedicines } from "@/lib/utils/search";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function POSSystem() {
  const { t, storeProfile, vatPercentage } = useStore();
  const { user, logout } = useAuth();
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

  // Fetch medicines from local DB
  const {
    data: medicines,
    loading: loadingMedicines,
    refetch: refetchMedicines,
  } = useLocalData<Medicine>(
    "SELECT * FROM medicines WHERE _deleted = 0 ORDER BY name ASC",
    [],
    {
      transform: (m: any) => ({
        id: m.id,
        name: m.name,
        generic_name: m.generic_name || "",
        brand: m.brand_name || m.brand || "",
        strength: m.strength || "",
        unit_price: m.selling_price || 0,
        stock: m.stock_quantity || 0,
        cost_price: m.cost_price || 0,
        barcode: m.barcode || "",
        batch_number: m.batch_number || "",
        category_id: m.category_id || "",
      }),
    },
  );

  const { data: recentSales, refetch: refetchSales } = useLocalData<any>(
    "SELECT s.*, c.first_name || ' ' || c.last_name as customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s._deleted = 0 ORDER BY s.created_at DESC LIMIT 10",
  );

  const { data: recentlySoldData } = useLocalData<any>(
    "SELECT DISTINCT medicine_id FROM sale_items ORDER BY created_at DESC LIMIT 8",
  );

  const { data: commonlySoldData } = useLocalData<any>(
    "SELECT medicine_id, SUM(quantity) as total_qty FROM sale_items GROUP BY medicine_id ORDER BY total_qty DESC LIMIT 8",
  );

  const recentlySoldIds =
    recentlySoldData?.map((item: any) => item.medicine_id) || [];
  const commonlySoldIds =
    commonlySoldData?.map((item: any) => item.medicine_id) || [];

  // Fetch customers from local DB
  const { data: customers, loading: loadingCustomers } = useLocalData<Customer>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC",
    [],
    {
      transform: (c: any) => ({
        id: c.id,
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        phone: c.phone || "",
        loyalty_points: c.loyalty_points || 0,
        outstanding_balance: c.outstanding_balance || 0,
      }),
    },
  );

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
  } = usePOSCart(medicines);

  const { suggestions } = useSmartSuggestions(cart, medicines);

  const requirePaymentAccount = storeProfile?.require_payment_account === 1;
  let enabledPaymentMethods = ["cash", "card", "transfer", "credit", "mixed"];
  try {
    if (storeProfile?.enabled_payment_methods) {
      enabledPaymentMethods = JSON.parse(storeProfile.enabled_payment_methods);
    }
  } catch (_e) {
    // default
  }

  const { data: paymentAccounts } = useLocalData<any>(
    "SELECT * FROM payment_accounts WHERE _deleted = 0 ORDER BY created_at DESC",
  );

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
    refetchMedicines,
    refetchSales,
    requirePaymentAccount,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (((e.altKey || e.ctrlKey) && e.key === "s") || e.key === "F1") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (cart.length > 0) {
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
        else if (cart.length > 0) {
          setShowClearCartDialog(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cart,
    selectedCustomer,
    showPaymentDialog,
    showReceiptDialog,
    searchTerm,
    clearCart,
    setShowPaymentDialog,
    setPaymentMethod,
  ]);

  const { results: filteredMedicines, isFuzzyFallback } = React.useMemo(() => {
    return searchMedicines(searchTerm, medicines);
  }, [searchTerm, medicines]);

  useEffect(() => {
    const rxId = searchParams.get("dispense_rx");
    if (rxId && medicines.length > 0 && cart.length === 0) {
      const loadPrescription = async () => {
        try {
          // fetch prescription items
          const itemsData = await query(
            "SELECT * FROM prescription_items WHERE prescription_id = ? AND _deleted = 0",
            [rxId],
          );

          // update prescription status to in_progress or dispensed
          // The POS handles final sale, but let's just load the cart for now.
          const restoredItems = itemsData
            .map((item: any) => {
              const medicine = medicines.find(
                (m) =>
                  m.name === item.medicine_name && m.strength === item.strength,
              );
              if (medicine) {
                return {
                  ...medicine,
                  quantity: item.quantity,
                  subtotal: medicine.unit_price * item.quantity,
                };
              }
              return null;
            })
            .filter((item: any) => item !== null) as any;

          if (restoredItems.length > 0) {
            restoreCart(restoredItems);
            toast.success("Prescription loaded into POS");
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete("dispense_rx");
            router.replace(`${pathname}?${newParams.toString()}`);
          } else {
            toast.error("Could not match prescription items to inventory.");
          }
        } catch (error) {
          console.error("Failed to load prescription to POS:", error);
          toast.error("Failed to load prescription.");
        }
      };
      loadPrescription();
    }
  }, [searchParams, medicines, cart.length, restoreCart, router, pathname]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      handleScanSuccess(searchTerm.trim());
    }
  };

  const handleScanSuccess = (scannedBarcode: string) => {
    const query = scannedBarcode.toLowerCase().trim();
    const barcodeMatch = medicines.find(
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

  const handlePrint = () => {
    window.print();
  };

  const handleHoldTransaction = async () => {
    if (cart.length === 0) return;

    try {
      const id = `held_${Date.now()}`;
      await insert("held_transactions", {
        id,
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : "Walk-in Customer",
        items_json: JSON.stringify(cart),
        total_amount: total,
        created_at: new Date().toISOString(),
      });

      toast.success("Transaction held successfully");
      clearCart();
      setSelectedCustomer(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to hold transaction");
    }
  };

  const handleRecallTransaction = async (held: any) => {
    try {
      // 1. Clear current cart (maybe ask user?)
      clearCart();

      // 2. Parse items and add to cart
      const items = JSON.parse(held.items_json);
      const restoredItems = items
        .map((item: any) => {
          const medicine = medicines.find(
            (m) => m.id === (item.medicine_id || item.id),
          );
          if (medicine) {
            return {
              ...medicine,
              quantity: item.quantity,
              subtotal: medicine.unit_price * item.quantity,
            };
          }
          return null;
        })
        .filter((item: any) => item !== null) as any;

      restoreCart(restoredItems);

      if (held.customer_id) {
        const customer = customers.find((c) => c.id === held.customer_id);
        if (customer) setSelectedCustomer(customer);
      }

      // 3. Delete from held
      await remove("held_transactions", held.id);

      toast.success("Transaction recalled");
      setShowHeldDialog(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to recall transaction");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header: title left, actions right — wraps on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif font-bold text-2xl sm:text-3xl text-foreground leading-tight">
            Point of Sale
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Process sales transactions and manage {t("products").toLowerCase()}{" "}
            orders
          </p>
        </div>
        {/* Action buttons — scroll horizontally when they don't fit */}
        <div className="w-full sm:w-auto overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 min-w-max">
            <Button
              variant={posMode === "standard" ? "default" : "outline"}
              size="sm"
              onClick={() => setPosMode("standard")}
              className="cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              Standard View
            </Button>
            <Button
              variant={posMode === "speed" ? "default" : "outline"}
              size="sm"
              onClick={() => setPosMode("speed")}
              className="cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Zap className="h-4 w-4" />
              Retail Speed
            </Button>
            <div className="w-px h-6 bg-border mx-0.5 shrink-0" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleHoldTransaction}
              disabled={cart.length === 0}
              className="cursor-pointer flex items-center gap-1.5 shrink-0 border-amber-500/20 hover:bg-amber-500/5 text-amber-600"
            >
              <PauseCircle className="h-4 w-4" />
              Pause
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHeldDialog(true)}
              className="cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Clock className="h-4 w-4" />
              Held Sales
            </Button>
            <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border shrink-0">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium max-w-[80px] truncate">
                {user?.first_name || user?.username}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 ml-1"
                onClick={logout}
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

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
          filteredMedicines={filteredMedicines}
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
                  loadingMedicines={loadingMedicines}
                  filteredMedicines={filteredMedicines}
                  isFuzzyFallback={isFuzzyFallback}
                  medicinesLength={medicines.length}
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
              onCheckout={() => setShowPaymentDialog(true)}
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
              <ReceiptView transaction={completedTransaction} />
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
      </Dialog>
      <ReturnDialog
        open={showReturnDialog}
        onOpenChange={setShowReturnDialog}
        sale={saleToReturn}
        onSuccess={() => {
          refetchMedicines();
          refetchSales();
          toast.success("Inventory updated after return");
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

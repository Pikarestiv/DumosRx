/* eslint-disable max-lines */
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Receipt,
  User,
  Zap,
  LogOut,
  PauseCircle,
  Clock,
} from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

interface Medicine {
  id: string;
  name: string;
  generic_name: string;
  brand: string;
  strength: string;
  unit_price: number;
  stock: number;
  barcode?: string;
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
import { HeldTransactionsDialog } from "./held-transactions-dialog";
import { insert, remove } from "@/lib/db/local-database";
import { searchMedicines } from "@/lib/utils/search";

export function POSSystem() {
  const { t, storeProfile, vatPercentage } = useStore();
  const { user, logout } = useAuth();
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [posMode, setPosMode] = useState<"standard" | "speed">("standard");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [saleToReturn, setSaleToReturn] = useState<any>(null);
  const [showHeldDialog, setShowHeldDialog] = useState(false);

  // Fetch medicines from local DB
  const {
    data: medicines,
    loading: loadingMedicines,
    refetch: refetchMedicines,
  } = useLocalData<Medicine>(
    'SELECT * FROM medicines WHERE _deleted = 0 ORDER BY name ASC',
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
        barcode: m.barcode || "",
      }),
    },
  );

  const { data: recentSales } = useLocalData<any>(
    "SELECT s.*, c.first_name || ' ' || c.last_name as customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s._deleted = 0 ORDER BY s.created_at DESC LIMIT 10"
  );

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

  const {
    paymentMethod,
    setPaymentMethod,
    amountPaid,
    setAmountPaid,
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
        if (e.key === "F4" && selectedCustomer) {
          e.preventDefault();
          setPaymentMethod("credit");
          setShowPaymentDialog(true);
        }
      }

      if (e.key === "Escape") {
        if (showPaymentDialog) setShowPaymentDialog(false);
        else if (showReceiptDialog) setShowReceiptDialog(false);
        else if (searchTerm) setSearchTerm("");
        else if (cart.length > 0) {
          if (confirm("Clear cart?")) clearCart();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, selectedCustomer, showPaymentDialog, showReceiptDialog, searchTerm, clearCart, setShowPaymentDialog, setPaymentMethod]);

  const { results: filteredMedicines, isFuzzyFallback } = React.useMemo(() => {
    return searchMedicines(searchTerm, medicines);
  }, [searchTerm, medicines]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      const barcodeMatch = medicines.find(
        (m) => m.barcode?.toLowerCase() === searchTerm.toLowerCase().trim()
      );

      if (barcodeMatch) {
        addToCart(barcodeMatch);
        setSearchTerm("");
        toast.success(`Scanned: ${barcodeMatch.name}`);
      }
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
        customer_name: selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : "Walk-in Customer",
        items_json: JSON.stringify(cart),
        total_amount: total,
        created_at: new Date().toISOString()
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
      const restoredItems = items.map((item: any) => {
        const medicine = medicines.find(m => m.id === (item.medicine_id || item.id));
        if (medicine) {
          return {
            ...medicine,
            quantity: item.quantity,
            subtotal: medicine.unit_price * item.quantity
          };
        }
        return null;
      }).filter(Boolean);
      
      restoreCart(restoredItems);

      if (held.customer_id) {
        const customer = customers.find(c => c.id === held.customer_id);
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">
            Point of Sale
          </h1>
          <p className="text-muted-foreground mt-2">
            Process sales transactions and manage {t('products').toLowerCase()} orders
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={posMode === "standard" ? "default" : "outline"} 
            size="sm"
            onClick={() => setPosMode("standard")}
            className="flex items-center gap-2"
          >
            Standard View
          </Button>
          <Button 
            variant={posMode === "speed" ? "default" : "outline"} 
            size="sm"
            onClick={() => setPosMode("speed")}
            className="flex items-center gap-2"
          >
            <Zap className="h-4 w-4" />
            Retail Speed
          </Button>
          <div className="w-px h-8 bg-border mx-1" />
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleHoldTransaction}
            disabled={cart.length === 0}
            className="flex items-center gap-2 border-amber-500/20 hover:bg-amber-500/5 text-amber-600"
          >
            <PauseCircle className="h-4 w-4" />
            Pause
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowHeldDialog(true)}
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            Held Sales
          </Button>
          <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">{user?.name}</span>
            <Button variant="ghost" size="icon" className="h-4 w-4 p-0 ml-1" onClick={logout}>
              <LogOut className="h-3 w-3" />
            </Button>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Tabs defaultValue="products" className="w-full">
              <TabsList className="bg-muted/50 p-1 h-auto flex-wrap justify-start mb-4">
                <TabsTrigger value="products" className="px-4 py-2">Products</TabsTrigger>
                <TabsTrigger value="history" className="px-4 py-2">Recent Transactions</TabsTrigger>
              </TabsList>
              
              <TabsContent value="products" className="space-y-4">
                <POSSearchCard 
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  onKeyDown={handleKeyPress}
                  searchInputRef={searchInputRef}
                  completedTransaction={completedTransaction}
                  setShowReceiptDialog={setShowReceiptDialog}
                  productTerm={t('product')}
                />

                <POSProductList
                  loadingMedicines={loadingMedicines}
                  filteredMedicines={filteredMedicines}
                  isFuzzyFallback={isFuzzyFallback}
                  medicinesLength={medicines.length}
                  addToCart={addToCart}
                  productTerm={t('product')}
                  currencyCode={storeProfile?.currency}
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
        processingPayment={processingPayment}
        handlePayment={handlePayment}
        selectedCustomer={selectedCustomer}
        currencyCode={storeProfile?.currency}
      />

      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-[450px] p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-muted/50 border-b">
            <DialogTitle>Sale Completed</DialogTitle>
            <DialogDescription>
              Transaction ID: {completedTransaction?.id?.slice(0, 8).toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[60vh] overflow-y-auto">
            {completedTransaction && (
              <ReceiptView transaction={completedTransaction} />
            )}
          </div>
          
          <div className="flex gap-3 p-6 bg-muted/50 border-t">
            <Button variant="outline" className="flex-1" onClick={() => setShowReceiptDialog(false)}>
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
          toast.success("Inventory updated after return");
        }}
        currencyCode={storeProfile?.currency}
      />

      <HeldTransactionsDialog 
        isOpen={showHeldDialog}
        onClose={() => setShowHeldDialog(false)}
        onRecall={handleRecallTransaction}
      />
    </div>
  );
}

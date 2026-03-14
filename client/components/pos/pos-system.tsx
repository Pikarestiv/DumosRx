"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { toast } from "sonner";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Receipt,
  User,
  Scan,
  Zap,
} from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { formatCurrency } from "@/lib/utils";

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
import { ReceiptView } from "./receipt-view";
import React from "react";

import { usePOSCart } from "@/lib/hooks/use-pos-cart";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import { POSProductList } from "./pos-product-list";
import { POSPaymentDialog } from "./pos-payment-dialog";
import { RetailSpeedPOS } from "./retail-speed-pos";

export function POSSystem() {
  const { t, storeProfile, vatPercentage } = useStore();
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [posMode, setPosMode] = useState<"standard" | "speed">("standard");

  // Fetch medicines from local DB
  const {
    data: medicines,
    loading: loadingMedicines,
    refetch: refetchMedicines,
  } = useLocalData<Medicine>(
    'SELECT * FROM medicines WHERE status = "active" AND _deleted = 0 ORDER BY name ASC',
    [],
    {
      transform: (m: any) => ({
        id: m.id,
        name: m.name,
        generic_name: m.generic_name || "",
        brand: m.brand || "",
        strength: m.strength || "",
        unit_price: m.selling_price || 0, // Note: using selling_price as unit_price
        stock: m.stock_quantity || 0,
        barcode: m.barcode || "",
      }),
    },
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
      // Focus Search: Alt+S or F1
      if (((e.altKey || e.ctrlKey) && e.key === "s") || e.key === "F1") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      // Fast Payment Methods
      if (cart.length > 0) {
        if (e.key === "F2") { // Cash
          e.preventDefault();
          setPaymentMethod("cash");
          setShowPaymentDialog(true);
        }
        if (e.key === "F3") { // Card
          e.preventDefault();
          setPaymentMethod("card");
          setShowPaymentDialog(true);
        }
        if (e.key === "F4" && selectedCustomer) { // Credit
          e.preventDefault();
          setPaymentMethod("credit");
          setShowPaymentDialog(true);
        }
      }

      // Clear/Close
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

  const filteredMedicines = medicines.filter(
    (medicine) =>
      medicine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.barcode?.includes(searchTerm),
  );

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      // Check for exact barcode match first
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
        </div>
      </div>

      {posMode === "speed" ? (
        <RetailSpeedPOS
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          total={total}
          discount={discount}
          vatPercentage={vatPercentage}
          currencyCode={storeProfile?.currency}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filteredMedicines={filteredMedicines}
          addToCart={addToCart}
          updateQuantity={updateQuantity}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          handlePayment={handlePayment}
          setPaymentMethod={setPaymentMethod}
          setShowPaymentDialog={setShowPaymentDialog}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Search and Selection */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <Search className="h-5 w-5" />
                {t('product')} Search
              </CardTitle>
              <CardDescription>
                Search by name, brand, or scan barcode
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder={`Search ${t('products').toLowerCase()} or scan barcode...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent cursor-pointer"
                  onClick={() => toast.info("Camera scanner coming soon! Keyboard scanners work in the search box.")}
                >
                  <Scan className="h-4 w-4" />
                  Scan
                </Button>
                {completedTransaction && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowReceiptDialog(true)}
                  >
                    <Receipt className="h-4 w-4" />
                    Last Receipt
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <POSProductList
            loadingMedicines={loadingMedicines}
            filteredMedicines={filteredMedicines}
            medicinesLength={medicines.length}
            addToCart={addToCart}
            productTerm={t('product')}
            currencyCode={storeProfile?.currency}
          />
        </div>

        {/* Shopping Cart and Checkout */}
        <div className="space-y-4">
          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCustomer ? (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {selectedCustomer.first_name}{" "}
                        {selectedCustomer.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedCustomer.phone}
                      </p>
                      <p className="text-xs text-accent">
                        {selectedCustomer.loyalty_points} loyalty points
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomer(null)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Select
                  onValueChange={(value) => {
                    const customer = customers.find((c) => c.id === value);
                    if (customer) setSelectedCustomer(customer);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingCustomers
                          ? "Loading..."
                          : "Select customer (optional)"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name} -{" "}
                        {customer.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Shopping Cart */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Shopping Cart ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Cart is empty</p>
                    <p className="text-xs">Click on products to add them</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 border border-border rounded"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.unit_price)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm">
                          {item.quantity}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">
                          {formatCurrency(item.subtotal)}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(subtotal, storeProfile?.currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>VAT ({vatPercentage}%):</span>
                      <span>{formatCurrency(tax, storeProfile?.currency)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-accent">
                        <span>Loyalty Discount:</span>
                        <span>-{formatCurrency(discount, storeProfile?.currency)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Total:</span>
                      <span>{formatCurrency(total, storeProfile?.currency)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={clearCart}
                      className="flex-1 bg-transparent"
                    >
                      Clear Cart
                    </Button>
                    <Button
                      onClick={() => setShowPaymentDialog(true)}
                      className="flex-1 bg-accent hover:bg-accent/90"
                    >
                      Checkout
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
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

      {/* Receipt Dialog */}
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
    </div>
  );
}

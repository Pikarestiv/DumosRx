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
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  User,
  Scan,
  PackageX,
  Loader2,
} from "lucide-react";
import { insert, update } from "@/lib/db/local-database";
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

interface CartItem extends Medicine {
  quantity: number;
  subtotal: number;
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
}

import { useStore } from "@/lib/context/store-context";
import { ReceiptView } from "./receipt-view";
import React from "react";

export function POSSystem() {
  const { t } = useStore();
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [completedTransaction, setCompletedTransaction] = useState<any>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mobile" | "">("");
  const [amountPaid, setAmountPaid] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);

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
      }),
    },
  );

  const filteredMedicines = medicines.filter(
    (medicine) =>
      medicine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.barcode?.includes(searchTerm),
  );

  const addToCart = (medicine: Medicine) => {
    const existingItem = cart.find((item) => item.id === medicine.id);

    if (existingItem) {
      if (existingItem.quantity < medicine.stock) {
        updateQuantity(medicine.id, existingItem.quantity + 1);
      } else {
        toast.warning("Insufficient stock available");
      }
    } else {
      if (medicine.stock > 0) {
        const cartItem: CartItem = {
          ...medicine,
          quantity: 1,
          subtotal: medicine.unit_price,
        };
        setCart([...cart, cartItem]);
        toast.success(`${medicine.name} added to cart`);
      } else {
        toast.error("This item is out of stock");
      }
    }
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(id);
      return;
    }

    const medicine = medicines.find((m) => m.id === id);
    if (medicine && newQuantity > medicine.stock) {
      toast.warning("Insufficient stock available");
      return;
    }

    setCart(
      cart.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: newQuantity,
              subtotal: item.unit_price * newQuantity,
            }
          : item,
      ),
    );
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(null);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = subtotal * 0.075; // 7.5% VAT in Nigeria
  const discount = selectedCustomer
    ? Math.floor(selectedCustomer.loyalty_points / 10) * 5
    : 0;
  const total = subtotal + tax - discount;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handlePayment = async () => {
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    if (paymentMethod === "cash") {
      const paid = Number.parseFloat(amountPaid);
      if (!paid || paid < total) {
        toast.error("Insufficient payment amount");
        return;
      }
    }

    setProcessingPayment(true);

    try {
      // 1. Create Sale
      const user = JSON.parse(localStorage.getItem("dumos_user") || "{}");
      const cashierId = user?.id || null;
      const transactionNumber = `TXN${Date.now()}`;

      const saleId = insert("sales", {
        transaction_number: transactionNumber,
        customer_id: selectedCustomer?.id || null,
        cashier_id: cashierId,
        subtotal,
        discount_amount: discount,
        discount_percentage: 0, // Calculate if needed
        tax_amount: tax,
        tax_percentage: 7.5,
        total_amount: total,
        amount_paid:
          paymentMethod === "cash"
            ? Number.parseFloat(amountPaid) || total
            : total,
        change_given:
          paymentMethod === "cash"
            ? Math.max(0, (Number.parseFloat(amountPaid) || 0) - total)
            : 0,
        points_earned: 0, // Implement points logic if needed
        points_redeemed: 0,
        payment_method: paymentMethod,
        payment_status: "completed",
        transaction_date: new Date().toISOString(),
        receipt_printed: 0,
        notes: "POS Sale",
      });

      // 2. Create Sale Items and Update Stock
      cart.forEach((item) => {
        // Add sale item
        insert("sale_items", {
          sale_id: saleId,
          medicine_id: item.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.subtotal,
        });

        // Deduct stock
        const newStock = Math.max(0, item.stock - item.quantity);
        update("medicines", item.id, { stock_quantity: newStock });
      });

      // 3. Refresh Medicines List
      refetchMedicines();

      const transaction = {
        id: saleId, // Use the generated ID
        date: new Date().toISOString(),
        items: cart,
        customer: selectedCustomer,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        amountPaid:
          paymentMethod === "cash" ? Number.parseFloat(amountPaid) : total,
        change:
          paymentMethod === "cash" ? Number.parseFloat(amountPaid) - total : 0,
      };

      setCompletedTransaction(transaction);
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
      toast.success("Payment successful (Local)");

      // Clear cart and reset
      clearCart();
      setPaymentMethod("");
      setAmountPaid("");
    } catch (error) {
      console.error("Payment failed:", error);
      toast.error("Payment failed. Please try again.");
    } finally {
      setProcessingPayment(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Point of Sale
        </h1>
        <p className="text-muted-foreground mt-2">
          Process sales transactions and manage {t('products').toLowerCase()} orders
        </p>
      </div>

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

          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold">
                Available {t('products')}
              </CardTitle>
              <CardDescription>
                {loadingMedicines
                  ? "Loading..."
                  : `Showing ${filteredMedicines.length} of ${medicines.length} ${t('products').toLowerCase()}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMedicines ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-3 border rounded-lg space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                  ))}
                </div>
              ) : filteredMedicines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <PackageX className="h-12 w-12 mb-4" />
                  <p className="font-medium">No {t('products').toLowerCase()} found</p>
                  <p className="text-sm">
                    Try a different search term or add {t('products').toLowerCase()} to inventory.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {filteredMedicines.map((medicine) => (
                    <div
                      key={medicine.id}
                      className="p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => addToCart(medicine)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">
                            {medicine.name}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {medicine.brand} • {medicine.strength}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-bold text-accent">
                              {formatCurrency(medicine.unit_price)}
                            </span>
                            <Badge
                              variant={
                                medicine.stock > 10
                                  ? "default"
                                  : medicine.stock > 0
                                    ? "outline"
                                    : "destructive"
                              }
                              className="text-xs"
                            >
                              {medicine.stock} in stock
                            </Badge>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="ml-2">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>VAT (7.5%):</span>
                      <span>{formatCurrency(tax)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-accent">
                        <span>Loyalty Discount:</span>
                        <span>-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Total:</span>
                      <span>{formatCurrency(total)}</span>
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

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif font-bold">Payment</DialogTitle>
            <DialogDescription>
              Total amount: {formatCurrency(total)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Payment Method</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                  className="flex flex-col gap-1 h-16"
                >
                  <Banknote className="h-5 w-5" />
                  <span className="text-xs">Cash</span>
                </Button>
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                  className="flex flex-col gap-1 h-16"
                >
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs">Card</span>
                </Button>
                <Button
                  variant={paymentMethod === "mobile" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("mobile")}
                  className="flex flex-col gap-1 h-16"
                >
                  <Smartphone className="h-5 w-5" />
                  <span className="text-xs">Mobile</span>
                </Button>
              </div>
            </div>

            {paymentMethod === "cash" && (
              <div>
                <label className="text-sm font-medium">Amount Paid</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="mt-1"
                />
                {amountPaid && Number.parseFloat(amountPaid) >= total && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Change:{" "}
                    {formatCurrency(Number.parseFloat(amountPaid) - total)}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowPaymentDialog(false)}
                className="flex-1"
                disabled={processingPayment}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePayment}
                className="flex-1 bg-accent hover:bg-accent/90"
                disabled={processingPayment}
              >
                {processingPayment && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {processingPayment ? "Processing..." : "Process Payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

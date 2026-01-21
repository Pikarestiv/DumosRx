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
import { apiClient } from "@/lib/api/client";

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

export function POSSystem() {
  const [searchTerm, setSearchTerm] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "mobile" | ""
  >("");
  const [amountPaid, setAmountPaid] = useState("");
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    async function fetchMedicines() {
      setLoadingMedicines(true);
      try {
        const res = await apiClient.getMedicines(1, 100);
        const items = (res.data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          generic_name: m.generic_name || m.genericName || "",
          brand: m.brand || "",
          strength: m.strength || "",
          unit_price: m.unit_price || m.price || 0,
          stock: m.stock_quantity || m.stock || 0,
          barcode: m.barcode || "",
        }));
        setMedicines(items);
      } catch (error) {
        console.error("Failed to fetch medicines:", error);
        toast.error("Failed to load medicines");
      } finally {
        setLoadingMedicines(false);
      }
    }

    async function fetchCustomers() {
      setLoadingCustomers(true);
      try {
        const res = await apiClient.getCustomers(1, 100);
        const items = (res.data || []).map((c: any) => ({
          id: c.id,
          first_name: c.first_name || "",
          last_name: c.last_name || "",
          phone: c.phone || "",
          loyalty_points: c.loyalty_points || 0,
        }));
        setCustomers(items);
      } catch (error) {
        console.error("Failed to fetch customers:", error);
      } finally {
        setLoadingCustomers(false);
      }
    }

    fetchMedicines();
    fetchCustomers();
  }, []);

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
      // Create sale via API
      const saleData = {
        items: cart.map((item) => ({
          medicine_id: item.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        })),
        customer_id: selectedCustomer?.id || null,
        subtotal,
        tax,
        discount,
        total,
        payment_method: paymentMethod,
        amount_paid:
          paymentMethod === "cash" ? Number.parseFloat(amountPaid) : total,
      };

      await apiClient.createSale(saleData);

      const transaction = {
        id: Date.now().toString(),
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

      setLastTransaction(transaction);
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
      toast.success("Payment successful!");

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

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Point of Sale
        </h1>
        <p className="text-muted-foreground mt-2">
          Process sales transactions and manage customer orders
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Search and Selection */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <Search className="h-5 w-5" />
                Product Search
              </CardTitle>
              <CardDescription>
                Search by name, brand, generic name, or scan barcode
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search medicines or scan barcode..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent"
                >
                  <Scan className="h-4 w-4" />
                  Scan
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold">
                Available Medicines
              </CardTitle>
              <CardDescription>
                {loadingMedicines
                  ? "Loading..."
                  : `Showing ${filteredMedicines.length} of ${medicines.length} medicines`}
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
                  <p className="font-medium">No medicines found</p>
                  <p className="text-sm">
                    Try a different search term or add medicines to inventory.
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
                    if (customer) selectCustomer(customer);
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Transaction Complete
            </DialogTitle>
          </DialogHeader>

          {lastTransaction && (
            <div className="space-y-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="font-bold text-lg text-accent">
                  Payment Successful!
                </p>
                <p className="text-sm text-muted-foreground">
                  Transaction ID: {lastTransaction.id}
                </p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(lastTransaction.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT:</span>
                  <span>{formatCurrency(lastTransaction.tax)}</span>
                </div>
                {lastTransaction.discount > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>Discount:</span>
                    <span>-{formatCurrency(lastTransaction.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(lastTransaction.total)}</span>
                </div>
                {lastTransaction.change > 0 && (
                  <div className="flex justify-between font-bold text-primary">
                    <span>Change:</span>
                    <span>{formatCurrency(lastTransaction.change)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 bg-transparent">
                  Print Receipt
                </Button>
                <Button
                  onClick={() => setShowReceiptDialog(false)}
                  className="flex-1"
                >
                  New Sale
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

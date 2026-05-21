"use client";

import { useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  User, 
  CreditCard,
  Banknote,
  Zap,
  Package,
  AlertCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface RetailSpeedPOSProps {
  cart: any[];
  subtotal: number;
  tax: number;
  total: number;
  vatPercentage: number;
  currencyCode?: string;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredMedicines: any[];
  addToCart: (medicine: any) => void;
  updateQuantity: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  selectedCustomer: any;
  setPaymentMethod: (method: any) => void;
  setShowPaymentDialog: (show: boolean) => void;
  isFuzzyFallback?: boolean;
}

export function RetailSpeedPOS({
  cart,
  subtotal,
  tax,
  total,
  vatPercentage,
  currencyCode,
  searchTerm,
  setSearchTerm,
  filteredMedicines,
  addToCart,
  updateQuantity,
  removeFromCart,
  clearCart,
  selectedCustomer,
  setPaymentMethod,
  setShowPaymentDialog,
  isFuzzyFallback,
}: RetailSpeedPOSProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus search on mount
    searchInputRef.current?.focus();
  }, []);

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-12rem)] overflow-hidden">
      {/* Left Column: Cart (Compact) */}
      <Card className="col-span-4 flex flex-col h-full overflow-hidden border-accent/20">
        <CardHeader className="py-3 px-4 border-b bg-accent/5">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Current Order
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          <div className="divide-y divide-border">
            {cart.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground opacity-50">
                <Package className="h-12 w-12 mx-auto mb-2" />
                <p>Ready for scanning...</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="p-3 hover:bg-muted/30 group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm leading-tight">{item.name}</span>
                    <span className="font-bold text-sm">{formatCurrency(item.subtotal, currencyCode)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{item.quantity} x {formatCurrency(item.unit_price, currencyCode)}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
        <div className="p-4 bg-muted/50 border-t space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Subtotal:</span>
            <span>{formatCurrency(subtotal, currencyCode)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>VAT ({vatPercentage}%):</span>
            <span>{formatCurrency(tax, currencyCode)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-xl font-black text-foreground">
            <span>TOTAL:</span>
            <span>{formatCurrency(total, currencyCode)}</span>
          </div>
        </div>
      </Card>

      {/* Right Column: Search & Quick Actions */}
      <div className="col-span-8 flex flex-col gap-4 overflow-hidden">
        {/* Search Bar */}
        <Card className="border-accent/30 shadow-md">
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-accent" />
              <Input
                ref={searchInputRef}
                placeholder="READY TO SCAN / SEARCH (F1)"
                className="pl-12 h-14 text-xl font-bold bg-accent/5 border-2 border-accent/20 focus-visible:ring-accent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                <Badge variant="outline" className="bg-background">Alt + S</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fast Favorites (Top Items) */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar min-h-10">
          {filteredMedicines.slice(0, 6).map(m => (
            <Button
              key={`fav-${m.id}`}
              variant="outline"
              size="sm"
              className="whitespace-nowrap bg-accent/5 hover:bg-accent hover:text-white transition-all font-bold border-accent/20 h-9"
              onClick={() => addToCart(m)}
            >
              {m.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-9">+ Set Favorites</Button>
        </div>

        {/* Results / Fast Picker */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-4 h-full overflow-y-auto">
            {searchTerm ? (
              <div className="flex flex-col h-full">
                {isFuzzyFallback && filteredMedicines.length > 0 && (
                  <div className="mb-3 px-3 py-2 bg-amber-500/10 text-amber-600 rounded-md text-xs font-bold flex items-center gap-2 shrink-0 border border-amber-500/20">
                    <AlertCircle className="h-4 w-4" />
                    Did you mean? (No exact matches)
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredMedicines.map((m) => (
                  <Button
                    key={m.id}
                    variant="outline"
                    className="h-auto flex-col items-start p-3 gap-1 hover:border-accent hover:bg-accent/5 transition-all"
                    onClick={() => {
                      addToCart(m);
                      setSearchTerm("");
                      searchInputRef.current?.focus();
                    }}
                  >
                    <span className="font-bold text-sm text-left line-clamp-1">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.brand}</span>
                    <div className="flex justify-between w-full mt-1">
                      <span className="text-accent font-bold">{formatCurrency(m.unit_price, currencyCode)}</span>
                      <span className="text-[10px] bg-muted px-1 rounded">Stock: {m.stock}</span>
                    </div>
                  </Button>
                ))}
              </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center">
                <Zap className="h-12 w-12 mb-4 opacity-20" />
                <h3 className="text-lg font-medium">Retail Speed Mode Active</h3>
                <p className="max-w-xs text-sm">Keyboard shortcuts are enabled. Start typing or scan a barcode to begin.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Shortcut Bar */}
        <div className="grid grid-cols-4 gap-4">
          <Button 
            className="h-16 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-lg"
            disabled={cart.length === 0}
            onClick={() => {
              setPaymentMethod("cash");
              setShowPaymentDialog(true);
            }}
          >
            <Banknote className="mr-2 h-6 w-6" />
            CASH (F2)
          </Button>
          <Button 
            className="h-16 text-lg font-bold bg-blue-600 hover:bg-blue-700 shadow-lg"
            disabled={cart.length === 0}
            onClick={() => {
              setPaymentMethod("card");
              setShowPaymentDialog(true);
            }}
          >
            <CreditCard className="mr-2 h-6 w-6" />
            CARD (F3)
          </Button>
          <Button 
            className="h-16 text-lg font-bold bg-purple-600 hover:bg-purple-700 shadow-lg"
            disabled={cart.length === 0 || !selectedCustomer}
            onClick={() => {
              setPaymentMethod("credit");
              setShowPaymentDialog(true);
            }}
          >
            <User className="mr-2 h-6 w-6" />
            DEBT (F4)
          </Button>
          <Button 
            variant="outline" 
            className="h-16 text-lg font-bold border-2"
            onClick={clearCart}
            disabled={cart.length === 0}
          >
            CLEAR (Esc)
          </Button>
        </div>
      </div>
    </div>
  );
}

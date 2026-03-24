"use client";

import { ShoppingCart, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

interface POSCartProps {
  cart: any[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  vatPercentage: number;
  currencyCode?: string;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  onCheckout: () => void;
}

export function POSCart({
  cart,
  subtotal,
  tax,
  total,
  discount,
  vatPercentage,
  currencyCode,
  updateQuantity,
  removeFromCart,
  clearCart,
  onCheckout
}: POSCartProps) {
  return (
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
                    {formatCurrency(item.unit_price, currencyCode)} each
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
                    {formatCurrency(item.subtotal, currencyCode)}
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
                <span>{formatCurrency(subtotal, currencyCode)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT ({vatPercentage}%):</span>
                <span>{formatCurrency(tax, currencyCode)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-accent">
                  <span>Loyalty Discount:</span>
                  <span>-{formatCurrency(discount, currencyCode)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total:</span>
                <span>{formatCurrency(total, currencyCode)}</span>
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
                onClick={onCheckout}
                className="flex-1 bg-accent hover:bg-accent/90"
              >
                Checkout
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

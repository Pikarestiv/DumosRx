"use client";

import { useState } from "react";
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  Package,
  PauseCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { RequestItemDialog } from "./request-item-dialog";

interface POSCartProps {
  cart: any[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  calculatedDiscount?: number;
  discountType?: "fixed" | "percentage";
  setDiscount?: (discount: number) => void;
  setDiscountType?: (type: "fixed" | "percentage") => void;
  vatPercentage: number;
  currencyCode?: string;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  onCheckout: () => void;
  onHoldSale?: () => void;
}

export function POSCart({
  cart,
  subtotal,
  tax,
  total,
  discount,
  calculatedDiscount = 0,
  discountType = "fixed",
  setDiscount,
  setDiscountType,
  vatPercentage,
  currencyCode,
  updateQuantity,
  removeFromCart,
  clearCart,
  onCheckout,
  onHoldSale,
}: POSCartProps) {
  const [showDiscount, setShowDiscount] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 py-1.5 min-h-[120px]">
        {cart.length === 0 && <EmptyCart />}
        {cart.length > 0 &&
          cart.map((item, idx) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-3 ${
                idx !== cart.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold mb-0.5 truncate leading-tight">
                  {item.name}
                </div>
                <div className="text-[11.5px] text-muted-foreground leading-tight">
                  {formatCurrency(item.unit_price, currencyCode)} each
                </div>
              </div>
              <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0 bg-muted/30">
                <button
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                >
                  <Minus className="w-3 h-3" strokeWidth={2.5} />
                </button>
                <span className="w-6 text-center text-xs font-semibold">
                  {item.quantity}
                </span>
                <button
                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                </button>
              </div>
              <div className="text-[13px] font-bold min-w-[56px] text-right">
                {formatCurrency(item.subtotal, currencyCode)}
              </div>
              <div
                className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0 ml-1"
                onClick={() => removeFromCart(item.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
      </div>

      <div className="border-t border-border px-5 pt-4 pb-5 bg-muted/10">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-[12.5px] text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal, currencyCode)}</span>
          </div>

          <div className="flex justify-between text-[12.5px] text-muted-foreground">
            <span>VAT ({vatPercentage}%)</span>
            <span>{formatCurrency(tax, currencyCode)}</span>
          </div>

          {(showDiscount || discount > 0) && (
            <div className="flex justify-between text-[12.5px] items-center gap-2">
              <span className="text-muted-foreground">Discount</span>
              <div className="flex gap-1 items-center flex-1 max-w-[160px] justify-end">
                <input
                  type="number"
                  className="flex h-7 w-16 rounded-md border border-input bg-background px-2 py-1 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={discount || ""}
                  placeholder="0"
                  onChange={(e) =>
                    setDiscount?.(parseFloat(e.target.value) || 0)
                  }
                />
                <select
                  className="flex h-7 rounded-md border border-input bg-background px-1 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType?.(e.target.value as "fixed" | "percentage")
                  }
                >
                  <option value="fixed">Fixed</option>
                  <option value="percentage">%</option>
                </select>
                <button
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => {
                    setShowDiscount(false);
                    setDiscount?.(0);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          {!(showDiscount || discount > 0) && (
            <div className="flex justify-between text-[12.5px] text-muted-foreground">
              <span
                className="text-primary font-semibold cursor-pointer hover:underline"
                onClick={() => setShowDiscount(true)}
              >
                + Add discount
              </span>
              <span>{formatCurrency(0, currencyCode)}</span>
            </div>
          )}

          {calculatedDiscount > 0 && (
            <div className="flex justify-end text-xs text-destructive font-medium">
              <span>-{formatCurrency(calculatedDiscount, currencyCode)}</span>
            </div>
          )}

          <div className="flex justify-between text-base font-bold text-foreground mt-2 pt-2.5 border-t border-dashed border-border">
            <span>Total</span>
            <span>{formatCurrency(total, currencyCode)}</span>
          </div>
        </div>

        <div
          className={`grid gap-2.5 mb-3.5 ${cart.length > 0 ? "grid-cols-3" : "grid-cols-2"}`}
        >
          <RequestItemDialog triggerClassName="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-[10px] border border-border bg-background text-[12.5px] font-semibold text-muted-foreground cursor-pointer hover:bg-primary/50 transition-colors h-auto" />

          {cart.length > 0 && (
            <button
              onClick={onHoldSale}
              className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-[10px] border border-amber-500/20 bg-amber-500/5 text-[12.5px] font-semibold text-amber-600 cursor-pointer hover:bg-amber-500/10 transition-colors"
            >
              <PauseCircle className="w-[15px] h-[15px]" />
              Hold Sale
            </button>
          )}

          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-[10px] border border-destructive/20 bg-destructive/5 text-[12.5px] font-semibold text-destructive cursor-pointer hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:grayscale"
          >
            <Trash2 className="w-[15px] h-[15px]" />
            Clear cart
          </button>
        </div>

        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full bg-primary text-primary-foreground border-0 p-3.5 rounded-xl text-[15px] font-bold cursor-pointer flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Charge {formatCurrency(total, currencyCode)}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className="w-[18px] h-[18px] ml-1"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="text-center py-10 text-muted-foreground h-full flex flex-col items-center justify-center">
      <ShoppingCart className="h-8 w-8 mb-3 opacity-30" />
      <p className="text-sm font-medium">Cart is empty</p>
      <p className="text-xs mt-1">Tap products to add them to the cart</p>
    </div>
  );
}

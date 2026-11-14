"use client";

import { ShoppingCart, X, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart, type CartItem, type ScopedCart } from "@/lib/store/use-cart-store";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/utils/currency";
import { toDisplayTitle } from "@/lib/storefront-display";

interface StorefrontCartProps {
  storeSlug: string;
  currency?: string | null;
}

export function StorefrontCart({ storeSlug, currency }: StorefrontCartProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const cart = useCart(storeSlug);
  const router = useRouter();

  useEffect(() => {
    // Persisted cart state is client-only; render after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleCheckout = () => {
    setIsOpen(false);
    router.push(`/store/${storeSlug}/checkout`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open cart" className="relative h-12 w-12 rounded-full shadow-md">
          <ShoppingCart className="h-6 w-6" />
          {cart.getItemCount() > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
              {cart.getItemCount()}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-4 sm:px-6 pt-5 pb-4 border-b">
          <SheetTitle>Your Cart</SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-4 opacity-20" />
              <p>Your cart is empty.</p>
            </div>
          ) : (
            <ul aria-label="Cart items" className="divide-y">
              {cart.items.map((item) => (
                <CartLine key={item.id} item={item} currency={currency} cart={cart} />
              ))}
            </ul>
          )}
        </div>

        {cart.items.length > 0 && (
          <div
            data-cart-footer
            className="sticky bottom-0 border-t bg-background px-4 sm:px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
          >
            <div className="flex items-center justify-between gap-4 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(cart.getTotal(), currency)}</span>
            </div>
            <Button className="w-full" size="lg" onClick={handleCheckout}>
              Proceed to Checkout
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartLine({
  item,
  currency,
  cart,
}: {
  item: CartItem;
  currency?: string | null;
  cart: ScopedCart;
}) {
  const name = toDisplayTitle(item.name);

  return (
    <li className="flex items-center gap-3 py-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold leading-snug break-words">{name}</p>
        <p className="text-sm text-primary tabular-nums">{formatMoney(item.price, currency)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={`Decrease quantity of ${name}`}
          onClick={() =>
            item.quantity > 1 ? cart.updateQuantity(item.id, item.quantity - 1) : cart.removeItem(item.id)
          }
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center tabular-nums" aria-label={`Quantity of ${name}`}>
          {item.quantity}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={`Increase quantity of ${name}`}
          onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-1 text-destructive hover:text-destructive/80"
          aria-label={`Remove ${name}`}
          onClick={() => cart.removeItem(item.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { OPEN_CART_EVENT } from "@/components/storefront/storefront-cart";
import { useCart } from "@/lib/store/use-cart-store";
import { formatMoney } from "@/lib/utils/currency";

interface MobileCartBarProps {
  storeSlug: string;
  currency?: string | null;
}

const subscribeNothing = () => () => {};

export function MobileCartBar({ storeSlug, currency }: MobileCartBarProps) {
  const cart = useCart(storeSlug);
  const pathname = usePathname();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const count = cart.getItemCount();

  if (!mounted || count === 0 || pathname?.endsWith("/checkout")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_CART_EVENT))}
        className={`pointer-events-auto flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-[color:var(--sf-ink)] px-4 text-[color:var(--sf-page)] shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]`}
      >
        <span className="flex items-center gap-3 font-medium">
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold [background:var(--primary)] [color:var(--primary-foreground)]">
            {count}
          </span>
          View cart
        </span>
        <span className="[font-family:var(--sf-font-price)] font-semibold tabular-nums">{formatMoney(cart.getTotal(), currency)}</span>
      </button>
    </div>
  );
}

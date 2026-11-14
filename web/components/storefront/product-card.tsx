"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { CategoryTile } from "@/components/storefront/category-tile";
import { useCart } from "@/lib/store/use-cart-store";
import { toDisplayTitle } from "@/lib/storefront-display";
import { isPriceOnRequest, stockHint, whatsappLink, type StockHint } from "@/lib/storefront-product";
import { ADD_BUTTON, CARD_SURFACE, FOCUS_RING, PRICE_FONT } from "@/lib/storefront-styles";
import type { StorefrontProduct } from "@/lib/types/storefront";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/utils/currency";

interface ProductCardProps {
  product: StorefrontProduct;
  storeSlug: string;
  currency?: string | null;
  whatsapp?: string | null;
  className?: string;
}

const HINT_STYLE: Record<StockHint["kind"], string> = {
  in: "text-emerald-700",
  low: "text-amber-700",
  out: "text-slate-600",
  unknown: "",
};

function hintLabel(hint: StockHint): string {
  if (hint.kind === "in") return "In stock";
  if (hint.kind === "low") return `Only ${hint.left} left`;
  if (hint.kind === "out") return "Out of stock";
  return "";
}

export function ProductCard({ product, storeSlug, currency, whatsapp, className }: ProductCardProps) {
  const cart = useCart(storeSlug);
  const displayName = toDisplayTitle(product.name);
  const price = parseFloat(String(product.selling_price));
  const onRequest = isPriceOnRequest(product.selling_price);
  const hint = stockHint(product);
  const askLink = onRequest ? whatsappLink(whatsapp, `Hi, how much is ${displayName}?`) : null;

  const handleAddToCart = () => {
    cart.addItem({ id: product.id, name: product.name, price, quantity: 1 });
    toast.success(`${displayName} added to cart`);
  };

  return (
    <article className={cn("flex h-full flex-col", CARD_SURFACE, className)}>
      <CategoryTile category={product.category?.name} image={product.image} alt={displayName} />
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">
          {displayName}
          {product.requires_prescription && (
            <span className="ml-2 rounded border border-destructive/40 px-1 text-[10px] font-semibold text-destructive">Rx</span>
          )}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("text-base sm:text-lg", onRequest ? "text-sm" : PRICE_FONT)}>
              {onRequest ? "Price on request" : formatMoney(price, currency)}
            </p>
            {!onRequest && hint.kind !== "unknown" && (
              <p className={cn("text-xs", HINT_STYLE[hint.kind])}>{hintLabel(hint)}</p>
            )}
          </div>
          {onRequest ? (
            askLink && (
              <a
                href={askLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ask about the price of ${displayName}`}
                className={cn("inline-flex min-h-11 items-center rounded-[var(--sf-button-radius)] border border-current px-4 text-sm font-medium", FOCUS_RING)}
              >
                Ask
              </a>
            )
          ) : (
            <button
              type="button"
              aria-label={`Add to cart: ${displayName}`}
              disabled={hint.kind === "out"}
              onClick={handleAddToCart}
              className={ADD_BUTTON}
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/store/use-cart-store";
import { toast } from "sonner";
import type { StorefrontProduct } from "@/lib/types/storefront";
import { formatMoney } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { toDisplayTitle } from "@/lib/storefront-display";

interface ProductCardProps {
  product: StorefrontProduct;
  storeSlug: string;
  currency?: string | null;
  className?: string;
}

export function ProductCard({ product, storeSlug, currency, className }: ProductCardProps) {
  const cart = useCart(storeSlug);
  const displayName = toDisplayTitle(product.name);

  const handleAddToCart = () => {
    cart.addItem({
      id: product.id,
      name: product.name,
      price: parseFloat(String(product.selling_price)),
      quantity: 1,
    });
    toast.success(`${displayName} added to cart`);
  };

  return (
    <Card className={cn("flex flex-col h-full gap-2 py-3 hover:shadow-lg transition-shadow sm:gap-6 sm:py-6", className)}>
      <CardHeader className="p-3 pb-1 sm:p-6 sm:pb-6">
        <div className="flex justify-between items-start">
          <CardTitle className="text-sm leading-snug sm:text-lg line-clamp-2">{displayName}</CardTitle>
          {product.requires_prescription && (
            <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Rx</Badge>
          )}
        </div>
        {product.generic_name && (
          <p className="hidden sm:block text-sm text-muted-foreground">{product.generic_name}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 items-end justify-between gap-2 p-3 pt-0 sm:block sm:p-6 sm:pt-0">
        <p className="text-base font-bold text-primary sm:mt-2 sm:text-2xl">
          {formatMoney(parseFloat(String(product.selling_price)), currency)}
        </p>
        <Button
          type="button"
          size="icon"
          aria-label={`Add ${displayName}`}
          onClick={handleAddToCart}
          className="h-9 w-9 shrink-0 rounded-full sm:hidden"
        >
          <Plus className="h-5 w-5" />
        </Button>
        {product.category && (
          <Badge variant="outline" className="mt-4 hidden sm:inline-flex">{product.category.name}</Badge>
        )}
      </CardContent>
      <CardFooter className="hidden sm:flex">
        <Button className="w-full" size="lg" onClick={handleAddToCart}>
          <ShoppingCart className="w-4 h-4 mr-2" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
}

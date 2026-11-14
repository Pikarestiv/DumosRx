"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/store/use-cart-store";
import { toast } from "sonner";
import type { StorefrontProduct } from "@/lib/types/storefront";
import { formatMoney } from "@/lib/utils/currency";
import { toDisplayTitle } from "@/lib/storefront-display";
import { useState } from "react";

interface ProductCardProps {
  product: StorefrontProduct;
  storeSlug: string;
  currency?: string | null;
}

export function ProductCard({ product, storeSlug, currency }: ProductCardProps) {
  const cart = useCart(storeSlug);
  const displayName = toDisplayTitle(product.name);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(product.image_url) && !imageFailed;

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
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow overflow-hidden">
      {showImage && (
        <div className="aspect-square w-full bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export: no next/image optimizer */}
          <img
            src={product.image_url ?? undefined}
            alt={displayName}
            width={512}
            height={512}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg line-clamp-2">{displayName}</CardTitle>
          {product.requires_prescription && (
            <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Rx</Badge>
          )}
        </div>
        {product.generic_name && (
          <p className="text-sm text-muted-foreground">{product.generic_name}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-2xl font-bold text-primary mt-2">
          {formatMoney(parseFloat(String(product.selling_price)), currency)}
        </p>
        {product.category && (
          <Badge variant="outline" className="mt-4">{product.category.name}</Badge>
        )}
      </CardContent>
      <CardFooter>
        <Button className="w-full" size="lg" onClick={handleAddToCart}>
          <ShoppingCart className="w-4 h-4 mr-2" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
}

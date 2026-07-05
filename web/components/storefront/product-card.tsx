"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/store/use-cart-store";
import { toast } from "sonner";

interface ProductCardProps {
  product: any;
}

export function ProductCard({ product }: ProductCardProps) {
  const cart = useCartStore();

  const handleAddToCart = () => {
    cart.addItem({
      id: product.id,
      name: product.name,
      price: parseFloat(product.selling_price),
      quantity: 1,
    });
    toast.success(`${product.name} added to cart`);
  };

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg line-clamp-2">{product.name}</CardTitle>
          {product.requires_prescription && (
            <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Rx</Badge>
          )}
        </div>
        {product.generic_name && (
          <p className="text-sm text-muted-foreground">{product.generic_name}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-2xl font-bold text-emerald-600 mt-2">
          ₦{parseFloat(product.selling_price).toLocaleString()}
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

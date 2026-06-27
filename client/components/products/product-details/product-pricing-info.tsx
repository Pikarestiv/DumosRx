import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DollarSign } from "lucide-react";
import type { Product } from "./use-product-details";

interface ProductPricingInfoProps {
  product: Product;
  formatPrice: (amount: number) => string;
  profitMargin: string;
}

export function ProductPricingInfo({
  product,
  formatPrice,
  profitMargin,
}: ProductPricingInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Pricing Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Cost Price</p>
            <p className="font-bold text-lg">
              {formatPrice(product.costPrice)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Selling Price</p>
            <p className="font-bold text-lg text-accent">
              {formatPrice(product.sellingPrice)}
            </p>
          </div>
        </div>
        <Separator />
        <div>
          <p className="text-sm text-muted-foreground">Profit Margin</p>
          <p className="font-bold text-lg text-primary">{profitMargin}%</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Profit per Unit</p>
          <p className="font-bold text-lg text-primary">
            {formatPrice(product.sellingPrice - product.costPrice)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

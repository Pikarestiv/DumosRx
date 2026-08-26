import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DollarSign } from "lucide-react";
import type { Product } from "./use-product-details";

interface ProductPricingInfoProps {
  product: Product;
  formatPrice: (amount: number) => string;
  profitMargin: string | null;
}

export function ProductPricingInfo({
  product,
  formatPrice,
  profitMargin,
}: ProductPricingInfoProps) {
  const unit = product.baseUnit || "unit";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Pricing Information
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          All prices are per {unit}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Avg. Cost Price</p>
            <p className="font-bold text-lg">
              {formatPrice(product.costPrice)}
            </p>
            <p className="text-xs text-muted-foreground">
              Averaged across current batches
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
          <p className="font-bold text-lg text-primary">
            {profitMargin !== null ? `${profitMargin}%` : "-"}
          </p>
          <p className="text-xs text-muted-foreground">Based on avg. cost</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Profit per {unit}</p>
          <p className="font-bold text-lg text-primary">
            {product.costPrice > 0
              ? formatPrice(product.sellingPrice - product.costPrice)
              : "-"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

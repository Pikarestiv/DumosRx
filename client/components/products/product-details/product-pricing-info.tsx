import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DollarSign } from "lucide-react";
import type { Product } from "./use-product-details";
import { useHasPermission } from "@/lib/hooks/use-permissions";

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
  const canViewCostFields = useHasPermission("view_cost_fields");
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
        <div className={`grid gap-4 ${canViewCostFields ? "grid-cols-2" : "grid-cols-1"}`}>
          {canViewCostFields && (
            <div>
              <p className="text-sm text-muted-foreground">Avg. Cost Price</p>
              <p className="font-bold text-lg">
                {formatPrice(product.costPrice)}
              </p>
              <p className="text-xs text-muted-foreground">
                Averaged across current batches
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Selling Price</p>
            <p className="font-bold text-lg text-accent">
              {formatPrice(product.sellingPrice)}
            </p>
          </div>
        </div>
        {canViewCostFields && product.lastBoughtPrice != null && (
          <div>
            <p className="text-sm text-muted-foreground">Last Bought Price</p>
            <p className="font-bold text-lg">
              {formatPrice(product.lastBoughtPrice)}
            </p>
            <p className="text-xs text-muted-foreground">
              Cost of the most recently received stock batch
            </p>
          </div>
        )}
        {canViewCostFields && (
          <>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

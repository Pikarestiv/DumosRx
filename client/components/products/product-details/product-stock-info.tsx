import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Calendar } from "lucide-react";
import type { Product } from "./use-product-details";

interface ProductStockInfoProps {
  product: Product;
  formatDate: (dateString: string) => string;
  daysToExpiry: number;
  expiryWarningDays: number;
}

export function ProductStockInfo({
  product,
  formatDate,
  daysToExpiry,
  expiryWarningDays,
}: ProductStockInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Stock & Expiry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Stock</p>
            <p
              className={`font-bold text-lg ${product.stockQuantity <= product.reorderLevel ? "text-destructive" : "text-primary"}`}
            >
              {product.stockQuantity} {product.baseUnit}(s)
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Reorder Level</p>
            <p className="font-medium">
              {product.reorderLevel} {product.baseUnit}(s)
            </p>
          </div>
        </div>
        {product.bulkUnit && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Unit Conversion</p>
              <p className="font-medium">
                1 {product.bulkUnit} = {product.unitsPerBulk} {product.baseUnit}
                (s)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total Stock (in {product.bulkUnit}):{" "}
                {(product.stockQuantity / product.unitsPerBulk).toFixed(2)}
              </p>
            </div>
          </>
        )}
        <Separator />
        <div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Expiry Date
          </p>
          {product.expiryDate ? (
            <>
              <p
                className={`font-medium ${daysToExpiry < 30 ? "text-destructive" : daysToExpiry < expiryWarningDays ? "text-orange-600" : "text-primary"}`}
              >
                {formatDate(product.expiryDate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {daysToExpiry > 0
                  ? `${daysToExpiry} days remaining`
                  : `Expired ${Math.abs(daysToExpiry)} days ago`}
              </p>
            </>
          ) : (
            <p className="font-medium text-muted-foreground">No expiry set</p>
          )}
        </div>

        {product.stockQuantity <= product.reorderLevel && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">
              Low Stock Alert
            </p>
            <p className="text-xs text-destructive/80">
              Stock level is below reorder threshold
            </p>
          </div>
        )}

        {daysToExpiry < expiryWarningDays && daysToExpiry > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm font-medium text-orange-800">
              Expiry Warning
            </p>
            <p className="text-xs text-orange-600">
              Product expires in less than {expiryWarningDays} days
            </p>
          </div>
        )}

        {product.expiryDate && daysToExpiry <= 0 && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">
              Expired Product
            </p>
            <p className="text-xs text-destructive/80">
              This product has expired and should not be sold
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

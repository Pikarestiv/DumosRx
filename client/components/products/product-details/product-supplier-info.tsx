import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Building, Truck } from "lucide-react";
import type { Product } from "./use-product-details";

interface ProductSupplierInfoProps {
  product: Product;
}

export function ProductSupplierInfo({ product }: ProductSupplierInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <Building className="h-5 w-5" />
          Supplier & Manufacturer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Building className="h-4 w-4" />
            Manufacturer
          </p>
          <p className="font-medium">{product.manufacturer}</p>
        </div>
        <Separator />
        <div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Supplier
          </p>
          <p className="font-medium">{product.supplier}</p>
        </div>
      </CardContent>
    </Card>
  );
}

import { Separator } from "@/components/ui/separator";
import { Building, Truck } from "lucide-react";
import type { Product } from "./use-product-details";

interface ProductSupplierInfoProps {
  product: Product;
}

export function ProductSupplierInfo({ product }: ProductSupplierInfoProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
        Manufacturer
      </h3>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Building className="h-4 w-4" />
            Manufacturer
          </p>
          <p className="font-medium">{product.manufacturer}</p>
        </div>
      </div>
    </div>
  );
}

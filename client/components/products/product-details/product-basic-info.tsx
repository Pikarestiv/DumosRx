import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Package } from "lucide-react";
import type { Product } from "./use-product-details";

interface ProductBasicInfoProps {
  product: Product;
}

export function ProductBasicInfo({ product }: ProductBasicInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <Package className="h-5 w-5" />
          Basic Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Brand Name</p>
            <p className="font-medium">{product.brand || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Category</p>
            <p className="font-medium">{product.category}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Strength</p>
            <p className="font-medium">{product.strength}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Dosage Form</p>
            <p className="font-medium">{product.dosageForm}</p>
          </div>
        </div>
        <Separator />
        <div>
          <p className="text-sm text-muted-foreground">
            NAFDAC Registration Number
          </p>
          <p className="font-mono font-medium text-accent">
            {product.nafdacNumber}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Batch Number</p>
          <p className="font-mono font-medium">{product.batchNumber}</p>
        </div>
      </CardContent>
    </Card>
  );
}

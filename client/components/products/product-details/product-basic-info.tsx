import { Separator } from "@/components/ui/separator";
import type { Product } from "./use-product-details";
import type { ProductCreator } from "@/lib/db/queries/products";

interface ProductBasicInfoProps {
  product: Product;
  creator?: ProductCreator | null;
  formatDate: (dateString: string) => string;
}

export function ProductBasicInfo({ product, creator, formatDate }: ProductBasicInfoProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
        Basic Information
      </h3>
      <div className="grid grid-cols-2 gap-y-4 gap-x-2">
        <div>
          <p className="text-sm text-muted-foreground">Generic Name</p>
          <p className="font-medium">{product.genericName || "N/A"}</p>
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
        <div>
          <p className="text-sm text-muted-foreground">Barcode</p>
          <p className="font-mono font-medium">{product.barcode || "Not set"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Created By</p>
          <p className="font-medium">
            {creator?.user_name?.trim() || "—"}
            {creator?.created_at && (
              <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                {formatDate(creator.created_at)}
              </span>
            )}
          </p>
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
    </div>
  );
}

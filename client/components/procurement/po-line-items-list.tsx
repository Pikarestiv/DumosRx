import { Trash2, Package, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { StoreType } from "@/lib/context/store-context";

interface POLineItemsListProps {
  items: any[];
  onRemoveItem: (index: number) => void;
  storeType: StoreType;
}

export function POLineItemsList({ items, onRemoveItem, storeType }: POLineItemsListProps) {
  const ProductIcon = storeType === "pharmacy" ? Pill : Package;

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-accent/10 rounded-xl">
        No items added to the purchase order yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-3 rounded-lg border border-accent/10 bg-muted/20 hover:bg-muted/30 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ProductIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">{item.product_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] h-4">
                  {item.bulk_quantity} {item.bulk_unit}(s)
                </Badge>
                <span className="text-[10px] text-muted-foreground italic">
                  ({item.units_per_bulk} per unit)
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {formatCurrency(item.unit_cost)} / bulk
              </p>
              <p className="font-bold text-sm">
                {formatCurrency(item.subtotal)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onRemoveItem(index)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

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
      <div className="py-8 text-center text-[12.5px] text-muted-foreground border-2 border-dashed border-border rounded-xl">
        No items added to the purchase order yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex flex-col p-3 rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow group relative"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex gap-2.5">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary mt-0.5">
                <ProductIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-[13px] leading-tight text-foreground pr-6">
                  {item.product_name}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-muted-foreground/15 text-foreground">
                    {item.bulk_quantity} {item.bulk_unit}(s)
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    ({item.units_per_bulk} / unit)
                  </span>
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 absolute right-2 top-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onRemoveItem(index)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-1">
            <p className="text-[11px] text-muted-foreground">
              {formatCurrency(item.unit_cost)} / bulk
            </p>
            <p className="font-bold text-[13px] text-foreground">
              {formatCurrency(item.subtotal)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

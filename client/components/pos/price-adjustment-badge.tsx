import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface Props {
  markup?: number | null;
  cut?: number | null;
  currencyCode?: string;
}

/** Shows what a sale was charged above ("+") and below ("−") list price; renders nothing when neither applies. */
export function PriceAdjustmentBadge({ markup, cut, currencyCode }: Props) {
  const hasMarkup = (markup ?? 0) > 0.005;
  const hasCut = (cut ?? 0) > 0.005;
  if (!hasMarkup && !hasCut) return null;
  return (
    <>
      {hasMarkup && (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80 border-0 shrink-0 px-1.5">
          +{formatCurrency(markup ?? 0, currencyCode)}
        </Badge>
      )}
      {hasCut && (
        <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100/80 border-0 shrink-0 px-1.5">
          Price cut −{formatCurrency(cut ?? 0, currencyCode)}
        </Badge>
      )}
    </>
  );
}

/** Per-line note under a unit price: how far the charged price sits from the catalog price. */
export function LinePriceNote({
  unitPrice,
  listPrice,
  currencyCode,
}: {
  unitPrice: number;
  listPrice?: number | null;
  currencyCode?: string;
}) {
  if (listPrice == null) return null;
  const delta = unitPrice - listPrice;
  if (Math.abs(delta) <= 0.005) return null;
  const isCut = delta < 0;
  return (
    <span className={`block text-xs font-medium ${isCut ? "text-red-600" : "text-emerald-600"}`}>
      list {formatCurrency(listPrice, currencyCode)} · {isCut ? "−" : "+"}
      {formatCurrency(Math.abs(delta), currencyCode)} each
    </span>
  );
}

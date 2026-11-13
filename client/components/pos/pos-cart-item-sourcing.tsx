import { Share2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

interface Props {
  item: CartItem;
  currencyCode?: string;
  isLocked: boolean;
  onConfigureSpotSourcing?: (item: CartItem) => void;
}

const PILL =
  "inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer";
const ICON = "w-3 h-3 shrink-0";

function shortfallLabel(item: CartItem): string | null {
  const stock = item.stock ?? 0;
  if (stock <= 0) return "Out of stock";
  return item.quantity > stock ? `${item.quantity - stock} short` : null;
}

export function POSCartItemSourcing({ item, currencyCode, isLocked, onConfigureSpotSourcing }: Props) {
  if (item.is_spot_sourced) {
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <button
          type="button"
          onClick={() => onConfigureSpotSourcing?.(item)}
          className={`${PILL} font-bold`}
          title="Edit spot sourcing details"
        >
          <Share2 className={ICON} />
          Spot Sourced
        </button>
        <span className="whitespace-nowrap text-[10px] font-medium text-amber-700 dark:text-amber-400">
          Cost {formatCurrency(item.sourcing_cost || 0, currencyCode)}
        </span>
      </div>
    );
  }

  if (!onConfigureSpotSourcing || isLocked || item.item_type === "service") return null;

  const shortfall = shortfallLabel(item);
  if (!shortfall) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onConfigureSpotSourcing(item)}
          className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Source this item on the spot from an external store (e.g. if shelf stock is damaged)"
        >
          <Share2 className={ICON} />
          Source outside
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <button
        type="button"
        onClick={() => onConfigureSpotSourcing(item)}
        className={`${PILL} font-semibold`}
        title="Source this item on the spot from an external store"
      >
        <Share2 className={ICON} />
        Source outside
      </button>
      <span className="whitespace-nowrap text-[10px] font-medium text-amber-700 dark:text-amber-400">{shortfall}</span>
    </div>
  );
}

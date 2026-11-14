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
  "inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer";
const ICON = "w-3 h-3 shrink-0";

function shelfStatus(item: CartItem): string | null {
  const stock = item.stock ?? 0;
  if (item.quantity <= stock) return null;
  return stock <= 0 ? "Out of stock" : `${item.quantity - stock} short`;
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

  const status = shelfStatus(item);
  if (!status) return null;

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
      <span className="whitespace-nowrap text-[10px] font-medium text-amber-700 dark:text-amber-400">{status}</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/constants/category-icons";
import type { CartItem } from "@/lib/hooks/use-pos-cart";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";

const SWIPE_DELETE_THRESHOLD = -70;
const SWIPE_DELETE_VELOCITY = -500;

interface Props {
  item: CartItem;
  currencyCode?: string;
  isLast: boolean;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  isLocked?: boolean;
  isResellerSale?: boolean;
  updateUnitPrice?: (id: string, price: number) => void;
}

/** Swipe-left-to-remove cart row: a red delete backdrop revealed as the row is dragged left. */
export function POSCartItem({ item, currencyCode, isLast, updateQuantity, removeFromCart, isLocked = false, isResellerSale = false, updateUnitPrice }: Props) {
  const CategoryIcon = getCategoryIcon(item.category_name);
  const capsClass = useUppercaseDisplayClass();

  // The price input is uncontrolled-while-typing: it holds its own local
  // string state so keystrokes aren't clamped one-at-a-time against
  // item.unit_price (already-committed, already-clamped state) - clamping
  // on every keystroke meant typing "150" against a floor of 100 clamped
  // after the "1" alone, turning the next keystroke into "1005" instead of
  // "150". The real updateUnitPrice (which still clamps, as the source of
  // truth) only runs on blur/Enter.
  const [priceInput, setPriceInput] = useState(String(item.unit_price));

  useEffect(() => {
    // Re-sync when the external value changes from elsewhere (e.g. reseller
    // mode toggled off reverts the price) - but don't fight the user's
    // in-progress typing by resetting on every render when nothing external
    // actually changed.
    setPriceInput((prev) =>
      Number(prev) === item.unit_price ? prev : String(item.unit_price),
    );
  }, [item.unit_price]);

  const commitPrice = () => {
    const val = parseFloat(priceInput);
    if (!Number.isNaN(val)) updateUnitPrice?.(item.id, val);
    else setPriceInput(String(item.unit_price));
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {!isLocked && (
        <div className="absolute inset-0 flex items-center justify-end pr-4 bg-destructive text-destructive-foreground">
          <Trash2 className="w-4 h-4" />
        </div>
      )}
      <motion.div
        drag={isLocked ? false : "x"}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (isLocked) return;
          if (info.offset.x < SWIPE_DELETE_THRESHOLD || info.velocity.x < SWIPE_DELETE_VELOCITY) {
            removeFromCart(item.id);
          }
        }}
        className={`relative flex items-center gap-3 py-3 bg-background touch-pan-y ${
          isLast ? "" : "border-b border-border"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <CategoryIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[12.5px] font-semibold mb-0.5 truncate leading-tight ${capsClass}`}>
            {item.name}
          </div>
          {isResellerSale ? (
            <div className="flex items-center gap-1 text-[11.5px]">
              <input
                type="number"
                min={item.original_unit_price}
                step="1"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onBlur={commitPrice}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                className="w-20 h-6 px-1.5 rounded border border-border bg-background text-[11.5px]"
              />
              <span className="text-muted-foreground">each (min {formatCurrency(item.original_unit_price, currencyCode)})</span>
            </div>
          ) : (
            <div className="text-[11.5px] text-muted-foreground leading-tight">
              {formatCurrency(item.unit_price, currencyCode)} each
            </div>
          )}
        </div>
        {isLocked && (
          <span className="text-xs font-semibold text-muted-foreground px-2">
            Qty: {item.quantity}
          </span>
        )}
        {!isLocked && (
          <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0 bg-muted/30">
            <button
              className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
            >
              <Minus className="w-3 h-3" strokeWidth={2.5} />
            </button>
            <span className="w-6 text-center text-xs font-semibold">
              {item.quantity}
            </span>
            <button
              className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} />
            </button>
          </div>
        )}
        <div className="text-[13px] font-bold min-w-[56px] text-right">
          {formatCurrency(item.subtotal, currencyCode)}
        </div>
        {!isLocked && (
          <div
            className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0 ml-1"
            onClick={() => removeFromCart(item.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </div>
        )}
      </motion.div>
    </div>
  );
}

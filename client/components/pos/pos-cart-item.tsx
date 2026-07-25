"use client";

import { motion } from "framer-motion";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/constants/category-icons";

const SWIPE_DELETE_THRESHOLD = -70;
const SWIPE_DELETE_VELOCITY = -500;

interface Props {
  item: any;
  currencyCode?: string;
  isLast: boolean;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
}

/** Swipe-left-to-remove cart row: a red delete backdrop revealed as the row is dragged left. */
export function POSCartItem({ item, currencyCode, isLast, updateQuantity, removeFromCart }: Props) {
  const CategoryIcon = getCategoryIcon(item.category_name);

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-destructive text-destructive-foreground">
        <Trash2 className="w-4 h-4" />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
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
          <div className="text-[12.5px] font-semibold mb-0.5 truncate leading-tight">
            {item.name}
          </div>
          <div className="text-[11.5px] text-muted-foreground leading-tight">
            {formatCurrency(item.unit_price, currencyCode)} each
          </div>
        </div>
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
        <div className="text-[13px] font-bold min-w-[56px] text-right">
          {formatCurrency(item.subtotal, currencyCode)}
        </div>
        <div
          className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0 ml-1"
          onClick={() => removeFromCart(item.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </div>
      </motion.div>
    </div>
  );
}

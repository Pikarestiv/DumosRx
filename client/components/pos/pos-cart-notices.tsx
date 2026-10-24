"use client";

import { ShoppingCart, PauseCircle, Lock } from "lucide-react";

export function EmptyCart() {
  return (
    <div className="text-center py-10 text-muted-foreground h-full flex flex-col items-center justify-center">
      <ShoppingCart className="h-8 w-8 mb-3 opacity-30" />
      <p className="text-sm font-medium">Cart is empty</p>
      <p className="text-xs mt-1">Tap products to add them to the cart</p>
    </div>
  );
}

export function PrescriptionLockBanner({ onEditPrescription }: { onEditPrescription?: () => void }) {
  return (
    <div className="mx-5 mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-primary shrink-0">
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold">
        <Lock className="w-3.5 h-3.5" />
        Cart locked to this prescription
      </span>
      {!!onEditPrescription && (
        <button
          onClick={onEditPrescription}
          className="text-[11.5px] font-bold underline underline-offset-2 shrink-0 cursor-pointer"
        >
          Edit prescription
        </button>
      )}
    </div>
  );
}

export function HeldSalesChip({ count, onOpen }: { count: number; onOpen?: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-1/2 flex items-center justify-between gap-1.5 px-2 py-1 mb-2.5 rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 transition-colors cursor-pointer"
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold">
        <PauseCircle className="w-3 h-3" />
        {count} on hold
      </span>
      <span className="text-[10.5px] font-bold underline underline-offset-2">
        View
      </span>
    </button>
  );
}

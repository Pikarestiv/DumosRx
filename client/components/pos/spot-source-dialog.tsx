"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { Share2, Wallet, CreditCard, RotateCcw } from "lucide-react";
import type { CartItem, SpotSourcingConfig } from "@/lib/hooks/use-pos-cart";
import type { POSProduct } from "@/lib/types/product";

interface SpotSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItem?: CartItem | null;
  product?: POSProduct | null;
  currencyCode?: string;
  onConfirm: (
    config: SpotSourcingConfig,
    quantity?: number,
    sellingPrice?: number,
  ) => void;
  onRevertToShelf?: () => void;
}

export function SpotSourceDialog({
  open,
  onOpenChange,
  cartItem,
  product,
  currencyCode,
  onConfirm,
  onRevertToShelf,
}: SpotSourceDialogProps) {
  const targetName = cartItem?.name || product?.name || "Product";
  const defaultSelling = cartItem?.unit_price ?? product?.unit_price ?? 0;
  const defaultCost =
    cartItem?.sourcing_cost ??
    cartItem?.cost_price ??
    product?.cost_price ??
    0;

  const [sourcingCostInput, setSourcingCostInput] = useState(String(defaultCost));
  const [sellingPriceInput, setSellingPriceInput] = useState(String(defaultSelling));
  const [quantityInput, setQuantityInput] = useState(
    String(cartItem?.quantity ?? 1),
  );
  const [paymentSource, setPaymentSource] = useState<"cash_drawer" | "external">(
    cartItem?.sourcing_payment_source ?? "cash_drawer",
  );
  const [partner, setPartner] = useState(cartItem?.sourcing_partner ?? "");

  useEffect(() => {
    if (!open) return;
    setSourcingCostInput(String(defaultCost));
    setSellingPriceInput(String(defaultSelling));
    setQuantityInput(String(cartItem?.quantity ?? 1));
    setPaymentSource(cartItem?.sourcing_payment_source ?? "cash_drawer");
    setPartner(cartItem?.sourcing_partner ?? "");
  }, [open, cartItem, product, defaultCost, defaultSelling]);

  const sourcingCost = Math.max(0, parseFloat(sourcingCostInput) || 0);
  const sellingPrice = Math.max(0, parseFloat(sellingPriceInput) || 0);
  const quantity = Math.max(1, parseInt(quantityInput, 10) || 1);

  const unitProfit = sellingPrice - sourcingCost;
  const totalProfit = unitProfit * quantity;
  const marginPct =
    sellingPrice > 0 ? ((unitProfit) / sellingPrice) * 100 : 0;

  const handleSave = () => {
    onConfirm(
      {
        isSpotSourced: true,
        sourcingCost,
        paymentSource,
        partner: partner.trim() || undefined,
      },
      product ? quantity : undefined,
      product ? sellingPrice : undefined,
    );
    onOpenChange(false);
  };

  const handleRevert = () => {
    onRevertToShelf?.();
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2 text-lg font-bold">
          <Share2 className="h-5 w-5 text-amber-500" />
          <span>{cartItem?.is_spot_sourced ? "Edit Spot Sourcing" : "Spot Sourcing (External Sourcing)"}</span>
        </div>
      }
      description="Source this item on the spot from a partner or neighbour store. Net shelf stock is unchanged and profit margin is recorded immediately."
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {cartItem?.is_spot_sourced ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRevert}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Revert to Shelf
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            className="font-bold bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleSave}
          >
            {cartItem ? "Save Spot Sourcing" : "Add to Cart as Spot Sourced"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2 text-sm">
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3">
          <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
            {targetName}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Shelf Stock: <strong className="text-foreground">{cartItem?.stock ?? product?.stock ?? 0} units</strong>
            </span>
            <span>
              List Price: <strong className="text-foreground">{formatCurrency(defaultSelling, currencyCode)}</strong>
            </span>
          </div>
        </div>

        {product && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Quantity to Source</Label>
              <Input
                type="number"
                min={1}
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Selling Price (each)</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={sellingPriceInput}
                onChange={(e) => setSellingPriceInput(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold">Sourcing Cost (Unit Cost Paid Outside)</Label>
            <span className="text-[11px] text-muted-foreground">Amount you pay the external store</span>
          </div>
          <Input
            type="number"
            min={0}
            step="any"
            value={sourcingCostInput}
            onChange={(e) => setSourcingCostInput(e.target.value)}
            placeholder="0.00"
            className="h-10 text-base font-semibold"
          />
        </div>

        <div className="rounded-xl border border-border p-3 bg-muted/20 space-y-1 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Selling Price:</span>
            <span className="font-medium">{formatCurrency(sellingPrice, currencyCode)} each</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Sourcing Cost:</span>
            <span className="font-medium">{formatCurrency(sourcingCost, currencyCode)} each</span>
          </div>
          <div className="border-t border-border/60 pt-1 mt-1 flex justify-between items-center">
            <span className="font-semibold text-foreground">Estimated Profit:</span>
            <span
              className={`font-bold ${
                unitProfit >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {unitProfit >= 0 ? "+" : ""}
              {formatCurrency(totalProfit, currencyCode)} ({marginPct.toFixed(1)}% margin)
            </span>
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold mb-1.5 block">Payment Source (How did staff pay for it?)</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentSource("cash_drawer")}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                paymentSource === "cash_drawer"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <Wallet className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-bold text-foreground">Till Cash Drawer</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Deducts from drawer cash. Register balances automatically at close.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentSource("external")}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                paymentSource === "external"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <CreditCard className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-bold text-foreground">Owner Credit / External</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Paid on supplier credit or out-of-pocket. No cash taken from till.
                </div>
              </div>
            </button>
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold mb-1 block">External Supplier / Partner Name (Optional)</Label>
          <Input
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            placeholder="e.g. Pharmacy Across The Street, Kiki Hardware"
            className="h-9 text-xs"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

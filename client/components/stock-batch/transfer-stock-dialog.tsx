"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import {
  getTransferableProducts,
  transferStock,
  type TransferableProductRow,
} from "@/lib/db/queries/stock-transfers";

interface TransferStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: () => void;
}

/** Formats a product's picker label with its live available quantity, e.g.
 * "Paracetamol 500mg — 42 Unit available", so the amount on hand is visible
 * right in the picker without a second lookup. Kept in sync with `products`
 * (the fetched list) via the label<->id map below, mirroring the
 * label/field mapping pattern ImportMappingDialog already uses for its own
 * Combobox. */
function productLabel(product: TransferableProductRow): string {
  const unit = product.base_unit || "unit";
  return `${product.name} — ${product.available_quantity} ${unit} available`;
}

export function TransferStockDialog({
  open,
  onOpenChange,
  onTransferred,
}: TransferStockDialogProps) {
  const { availableStores } = useStore();
  const { user } = useAuth();

  const [sourceStoreId, setSourceStoreId] = useState("");
  const [destStoreId, setDestStoreId] = useState("");
  const [products, setProducts] = useState<TransferableProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSourceStoreId("");
    setDestStoreId("");
    setProducts([]);
    setProductId("");
    setQuantity("");
    setReason("");
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  // Reload the transferable-product list (with live available quantities)
  // whenever the source store changes, and drop any previously selected
  // product since it may not exist (or have stock) in the new source store.
  useEffect(() => {
    setProductId("");
    if (!sourceStoreId) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setLoadingProducts(true);
    getTransferableProducts(sourceStoreId)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((err) => {
        console.error("Failed to load transferable products:", err);
        if (!cancelled) toast.error("Failed to load products for that store");
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceStoreId]);

  const productLabelToId = useMemo(
    () => new Map(products.map((p) => [productLabel(p), p.id])),
    [products],
  );
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  const quantityNum = Number(quantity);
  const quantityValid = Number.isFinite(quantityNum) && quantityNum > 0;
  const exceedsAvailable =
    selectedProduct != null && quantityValid && quantityNum > selectedProduct.available_quantity;

  const canSubmit =
    !!sourceStoreId &&
    !!destStoreId &&
    sourceStoreId !== destStoreId &&
    !!productId &&
    quantityValid &&
    !exceedsAvailable &&
    !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await transferStock({
        sourceStoreId,
        destStoreId,
        productId,
        quantity: quantityNum,
        performedBy: user?.id ?? null,
        reason: reason.trim() || undefined,
      });
      toast.success(
        `Transferred ${result.quantityTransferred} unit(s) of ${selectedProduct?.name ?? "product"}`,
      );
      onTransferred();
      handleOpenChange(false);
    } catch (err) {
      console.error("Stock transfer failed:", err);
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  const destStoreOptions = availableStores.filter((s) => s.id !== sourceStoreId);
  const sourceStoreOptions = availableStores.filter((s) => s.id !== destStoreId);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Transfer stock"
      description="Move stock from one store to another. This creates a paired transfer entry in both stores' movement history."
      footer={
        <div className="flex justify-end gap-2 p-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!canSubmit}>
            {submitting ? "Transferring..." : "Transfer Stock"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-source-store">From store</Label>
            <Select value={sourceStoreId} onValueChange={setSourceStoreId}>
              <SelectTrigger id="transfer-source-store" className="w-full">
                <SelectValue placeholder="Select source store" />
              </SelectTrigger>
              <SelectContent>
                {sourceStoreOptions.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-dest-store">To store</Label>
            <Select value={destStoreId} onValueChange={setDestStoreId}>
              <SelectTrigger id="transfer-dest-store" className="w-full">
                <SelectValue placeholder="Select destination store" />
              </SelectTrigger>
              <SelectContent>
                {destStoreOptions.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Product</Label>
          <Combobox
            options={Array.from(productLabelToId.keys())}
            value={selectedProduct ? productLabel(selectedProduct) : ""}
            onChange={(label) => setProductId(productLabelToId.get(label) ?? "")}
            placeholder={
              !sourceStoreId
                ? "Select a source store first"
                : loadingProducts
                  ? "Loading products..."
                  : "Select a product"
            }
            emptyText={
              sourceStoreId && !loadingProducts
                ? "No transferable stock in that store"
                : "No option found."
            }
            disabled={!sourceStoreId || loadingProducts}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-quantity">Quantity</Label>
          <Input
            id="transfer-quantity"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            disabled={!productId}
          />
          {selectedProduct && (
            <p className="text-xs text-muted-foreground">
              {selectedProduct.available_quantity} {selectedProduct.base_unit || "unit"}(s) available
            </p>
          )}
          {exceedsAvailable && (
            <p className="text-xs text-destructive">
              Only {selectedProduct?.available_quantity} available — reduce the quantity.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-reason">Reason (optional)</Label>
          <Input
            id="transfer-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Rebalancing low stock"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

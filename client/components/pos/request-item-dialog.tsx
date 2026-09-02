"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Info, PackageSearch } from "lucide-react";
import { logRequestedProduct } from "@/lib/db/requested-products-queries";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getAllCustomers } from "@/lib/db/queries/customers";
import { getProductList } from "@/lib/db/queries/products";
import { SearchableInput } from "@/components/ui/searchable-input";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";
import type { Customer } from "@/lib/types/customer";
import type { Product } from "@/lib/types/product";

export function RequestItemDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialProductName = "",
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialProductName?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen =
    isControlled && controlledOnOpenChange
      ? controlledOnOpenChange
      : setInternalOpen;

  const [productName, setProductName] = useState(initialProductName);

  // Re-seed the name field whenever the dialog is (re)opened, since the
  // caller's initialProductName (e.g. the POS search term) can change
  // between opens while the dialog instance itself stays mounted.
  useEffect(() => {
    if (open) setProductName(initialProductName);
  }, [open, initialProductName]);
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: customers = [] } = useQuery({
    // getAllCustomers() (a flat list for POS-style pickers) is a different
    // shape from getCustomers() (used by useCustomerData, with joined
    // total_spent/last_visit). This must NOT share a cache key with that
    // one, or whichever query runs second overwrites the cache with an
    // incompatible shape for the other's consumers. Reuses the same key as
    // use-pos-data.ts's identical getAllCustomers() call for consistency.
    ...queryKeys.customers.posList(),
    queryFn: getAllCustomers,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  const { data: products = [] } = useQuery({
    ...queryKeys.products.list(),
    queryFn: getProductList,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  // Warn (non-blocking) when the typed name looks like something already in
  // the catalog: staff should double check before logging a duplicate
  // "missing product" request for stock that's already on hand.
  const possibleExistingMatch = useMemo(() => {
    const term = productName.trim();
    if (term.length < 3) return null;
    const { results } = genericFuzzySearch(term, products, ["name"]);
    return results[0] || null;
  }, [productName, products]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }

    setLoading(true);
    try {
      await logRequestedProduct(
        productName.trim(),
        customerName.trim() || undefined,
        parseInt(quantity) || 1,
        notes.trim() || undefined,
      );
      toast.success("Request logged successfully");
      setOpen(false);
      setProductName("");
      setCustomerName("");
      setQuantity("1");
      setNotes("");
    } catch (error) {
      console.error("Failed to log request:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Log Missing Product"
        className="sm:max-w-[425px]"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="mt-2 sm:mt-0"
            >
              Cancel
            </Button>
            <Button type="submit" form="request-item-form" disabled={loading}>
              {loading ? "Saving..." : "Save Request"}
            </Button>
          </div>
        }
      >
        <form id="request-item-form" onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <SearchableInput
                id="name"
                placeholder="e.g., Panadol Extra"
                value={productName}
                onValueChange={setProductName}
                options={products.map((p: Product) => p.name)}
                autoFocus
                required
              />
              {possibleExistingMatch && (
                <div className="text-[11.5px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-[10px] px-3 py-2.5 flex gap-2 items-start">
                  <PackageSearch className="w-[15px] h-[15px] shrink-0 mt-0.5" />
                  <span>
                    We may already carry{" "}
                    <span className="font-semibold">
                      {possibleExistingMatch.name}
                    </span>
                    . Check the catalog before logging a new request; continue
                    anyway if this is genuinely a different or out-of-stock
                    item.
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity Asked For</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2 flex flex-col">
                <Label htmlFor="customer">Customer (Optional)</Label>
                <SearchableInput
                  id="customer"
                  placeholder="Select or type..."
                  value={customerName}
                  onValueChange={setCustomerName}
                  options={customers.map((c: Customer) => ({
                    label:
                      `${c.first_name} ${c.last_name}${c.phone ? ` (${c.phone})` : ""}`.trim(),
                    value: `${c.first_name} ${c.last_name}`.trim(),
                  }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Brand preference, urgency, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none h-16"
              />
            </div>

            <div className="text-[11.5px] text-primary/80 bg-primary/10 border border-primary/20 rounded-[10px] px-3 py-2.5 flex gap-2 items-start mt-2">
              <Info className="w-[15px] h-[15px] shrink-0 mt-0.5" />
              This gets logged for restocking and sent to your manager right
              away.
            </div>
          </div>
        </form>
      </ResponsiveModal>
    </>
  );
}

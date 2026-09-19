import { insert, remove } from "@/lib/db/local-database";
import { toast } from "sonner";
import { Customer } from "./use-pos-data";
import type { POSProduct as Product } from "@/lib/types/product";
import type { CartItem } from "./use-pos-cart";
import type { HeldTransaction } from "@/lib/db/queries/sales";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

interface UsePOSHeldTransactionsProps {
  cart: CartItem[];
  total: number;
  discount: number;
  discountType: "fixed" | "percentage";
  selectedCustomer: Customer | null;
  clearCart: () => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  products: Product[];
  restoreCart: (
    items: CartItem[],
    restoredDiscount?: number,
    restoredDiscountType?: "fixed" | "percentage",
  ) => void;
  customers: Customer[];
  setShowHeldDialog: (show: boolean) => void;
}

export function usePOSHeldTransactions({
  cart,
  total,
  discount,
  discountType,
  selectedCustomer,
  clearCart,
  setSelectedCustomer,
  products,
  restoreCart,
  customers,
  setShowHeldDialog,
}: UsePOSHeldTransactionsProps) {
  const queryClient = useQueryClient();

  const handleHoldTransaction = async () => {
    if (cart.length === 0) return;

    try {
      const id = `held_${Date.now()}`;
      await insert("held_transactions", {
        id,
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : "Walk-in Customer",
        items_json: JSON.stringify(cart),
        total_amount: total,
        // Persist the discount alongside the total: clearCart() (called
        // right below) resets live discount state to 0, so without this the
        // total the customer was quoted couldn't be reconstructed on recall.
        discount,
        discount_type: discountType,
        created_at: new Date().toISOString(),
      });

      toast.success("Transaction held successfully");
      clearCart();
      setSelectedCustomer(null);
      
      // Invalidate the count query to update the UI
      void queryClient.invalidateQueries(queryKeys.heldTransactions.count());
    } catch (err) {
      console.error(err);
      toast.error("Failed to hold transaction");
    }
  };

  const handleRecallTransaction = async (held: HeldTransaction) => {
    try {
      // 1. Parse items first. The current cart is deliberately left
      // untouched until the parse/lookup work below has succeeded — clearing
      // it up front (the old behavior) meant a malformed items_json left the
      // cashier with neither the original cart nor the recalled one.
      // Discarding a non-empty cart is confirmed by the caller
      // (pos-dialogs.tsx) before we ever get here.
      const items: (CartItem & { product_id?: string })[] = JSON.parse(
        held.items_json,
      );
      const restoredItems = items
        .map((item) => {
          const product = products.find(
            (m) => m.id === (item.product_id || item.id),
          );
          if (product) {
            return {
              ...product,
              quantity: item.quantity,
              subtotal: product.unit_price * item.quantity,
              // Always derive from the current catalog price, not the
              // parsed items_json (which, for a transaction held before
              // this feature shipped, may not have an original_unit_price
              // at all). Same fix as use-pos-prescription.ts: without this,
              // a CartItem-shaped object flows into restoreCart() with
              // original_unit_price undefined, and a later updateUnitPrice()
              // call (e.g. after toggling reseller mode) does
              // Math.max(newPrice, undefined) => NaN, corrupting the price.
              original_unit_price: product.unit_price,
            };
          }
          return null;
        })
        .filter((item): item is CartItem => item !== null);

      // Items whose product was deleted/deactivated while the sale was held
      // are dropped by the filter above; say so rather than handing back a
      // quietly shorter cart than what was quoted.
      const missingCount = items.length - restoredItems.length;

      // Prices come from the current catalog, not from items_json, so a
      // price change during the hold silently re-quotes the customer unless
      // we flag it. One notice per recall, not per line.
      const hasRepricedItem = items.some((item) => {
        const product = products.find(
          (m) => m.id === (item.product_id || item.id),
        );
        return !!product && product.unit_price !== item.unit_price;
      });

      // 2. Only now is it safe to drop the current cart.
      clearCart();

      restoreCart(
        restoredItems,
        held.discount ?? 0,
        held.discount_type === "percentage" ? "percentage" : "fixed",
      );

      if (held.customer_id) {
        const customer = customers.find((c) => c.id === held.customer_id);
        if (customer) setSelectedCustomer(customer);
      }

      // 3. Delete from held
      await remove("held_transactions", held.id);

      toast.success("Transaction recalled");
      if (missingCount > 0) {
        toast.warning(
          `${missingCount} item(s) from this held sale are no longer available and were not restored.`,
        );
      }
      if (hasRepricedItem) {
        toast.info(
          "Some item prices have changed since this sale was held and were updated to current pricing.",
        );
      }
      setShowHeldDialog(false);
      
      // Invalidate the count query to update the UI
      void queryClient.invalidateQueries(queryKeys.heldTransactions.count());
    } catch (err) {
      console.error(err);
      toast.error("Failed to recall transaction");
    }
  };

  return {
    handleHoldTransaction,
    handleRecallTransaction,
  };
}

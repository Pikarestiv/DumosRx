import { insert, remove } from "@/lib/db/local-database";
import { generateId } from "@/lib/db/core";
import { toast } from "sonner";
import { Customer } from "./use-pos-data";
import type { POSProduct as Product } from "@/lib/types/product";
import type { CartItem, MarkupType } from "./use-pos-cart";
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
    restoredMarkup?: { isResellerSale: boolean; markupType: MarkupType | null },
  ) => void;
  customers: Customer[];
  setShowHeldDialog: (show: boolean) => void;
  isResellerSale: boolean;
  markupType: MarkupType | null;
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
  isResellerSale,
  markupType,
}: UsePOSHeldTransactionsProps) {
  const queryClient = useQueryClient();

  const handleHoldTransaction = async () => {
    if (cart.length === 0) return;

    try {
      // Date.now() as an explicit primary key collides across two terminals
      // holding a sale in the same millisecond - the losing cart silently
      // overwrites the other on sync. generateId() is collision-safe.
      const id = generateId();
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
        // Without these two a recalled reseller sale came back as an ordinary
        // sale at catalog prices: markup lost, commission never tracked.
        is_reseller_sale: isResellerSale ? 1 : 0,
        markup_type: isResellerSale ? markupType : null,
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
      const wasResellerSale = held.is_reseller_sale === 1;
      const productFor = (item: CartItem & { product_id?: string }) =>
        products.find((m) => m.id === (item.product_id || item.id));

      const restoredItems = items
        .map((item) => {
          const product = productFor(item);
          if (!product) return null;
          // Prices are rebuilt from the current catalog, which is the floor a
          // markup sits on top of; a held reseller sale keeps the agreed
          // marked-up unit price (clamped to that floor) instead of silently
          // re-quoting the customer at shelf price.
          const unitPrice = wasResellerSale
            ? Math.max(item.unit_price, product.unit_price)
            : product.unit_price;
          return {
            ...product,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal: unitPrice * item.quantity,
            original_unit_price: product.unit_price,
          };
        })
        .filter((item): item is CartItem => item !== null);

      // Items whose product was deleted/deactivated while the sale was held
      // are dropped by the filter above; say so rather than handing back a
      // quietly shorter cart than what was quoted.
      const missingCount = items.length - restoredItems.length;

      // A genuine catalog price change, measured against the price the line
      // was based on (original_unit_price when present) rather than the
      // possibly marked-up unit_price - comparing the latter reported every
      // restored reseller markup as a price change.
      const hasRepricedItem = items.some((item) => {
        const product = productFor(item);
        const heldBasePrice = item.original_unit_price ?? item.unit_price;
        return !!product && product.unit_price !== heldBasePrice;
      });

      // 2. Delete the held row BEFORE touching cart state. remove() can fail
      // for reasons unrelated to the recall (a read-only second tab, an
      // active store that has moved), and a cart already mutated behind a
      // "Failed to recall" toast left the sale listed as recallable again.
      await remove("held_transactions", held.id);

      // 3. Only now is it safe to drop the current cart.
      clearCart();

      restoreCart(
        restoredItems,
        held.discount ?? 0,
        held.discount_type === "percentage" ? "percentage" : "fixed",
        {
          isResellerSale: wasResellerSale,
          markupType: wasResellerSale
            ? held.markup_type === "store"
              ? "store"
              : "reseller"
            : null,
        },
      );

      if (held.customer_id) {
        const customer = customers.find((c) => c.id === held.customer_id);
        if (customer) setSelectedCustomer(customer);
      }

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

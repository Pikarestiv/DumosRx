import { insert, remove } from "@/lib/db/local-database";
import { generateId } from "@/lib/db/core";
import { toast } from "sonner";
import { Customer } from "./use-pos-data";
import type { POSProduct as Product } from "@/lib/types/product";
import type { Service } from "@/lib/types/service";
import type { CartItem, MarkupType } from "./use-pos-cart";
import type { HeldTransaction } from "@/lib/db/queries/sales";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";

interface UsePOSHeldTransactionsProps {
  cart: CartItem[];
  total: number;
  discount: number;
  discountType: "fixed" | "percentage";
  selectedCustomer: Customer | null;
  clearCart: () => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  products: Product[];
  services?: Service[];
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

function recalledUnitPrice(
  item: { unit_price: number; original_unit_price?: number; is_spot_sourced?: boolean },
  catalogPrice: number,
  wasResellerSale: boolean,
): number {
  if (!wasResellerSale && !item.is_spot_sourced) return catalogPrice;
  if (item.original_unit_price == null) return Math.max(item.unit_price, catalogPrice);
  return roundMoney(Math.max(0, catalogPrice + item.unit_price - item.original_unit_price));
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
  services = [],
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
      // Date.now() as an explicit primary key collides across two terminals holding a sale in the same millisecond - the losing cart silently overwr…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-held-transactions-ts-L54
      const id = generateId();
      await insert("held_transactions", {
        id,
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : "Walk-in Customer",
        items_json: JSON.stringify(cart),
        total_amount: total,
        // Persist the discount alongside the total:
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-held-transactions-ts-L66
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
      // 1. Parse items first.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-held-transactions-ts-L92
      const items: (CartItem & { product_id?: string })[] = JSON.parse(
        held.items_json,
      );
      const wasResellerSale = held.is_reseller_sale === 1;
      const productFor = (item: CartItem & { product_id?: string }) =>
        products.find((m) => m.id === (item.product_id || item.id));
      const serviceFor = (item: CartItem & { product_id?: string }) =>
        services.find((s) => s.id === (item.product_id || item.id));

      const restoredItems: CartItem[] = items
        .map((item): CartItem | null => {
          if (item.item_type === "service") {
            const service = serviceFor(item);
            const unitPrice = item.unit_price;
            const originalUnitPrice = service
              ? service.price
              : item.original_unit_price ?? item.unit_price;
            return {
              ...item,
              item_type: "service",
              name: service?.name || item.name,
              unit_price: unitPrice,
              original_unit_price: originalUnitPrice,
              subtotal: roundMoney(unitPrice * item.quantity),
              stock: null,
            };
          }

          const product = productFor(item);
          if (!product) return null;
          // Rebuilt from the current catalog; a held reseller sale keeps its agreed markup or cut relative to it.
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-held-transactions-ts-L109
          const unitPrice = recalledUnitPrice(item, product.unit_price, wasResellerSale);
          return {
            ...product,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal: roundMoney(unitPrice * item.quantity),
            original_unit_price: product.unit_price,
            ...(item.is_spot_sourced
              ? {
                  is_spot_sourced: true,
                  sourcing_cost: item.sourcing_cost ?? product.cost_price ?? 0,
                  sourcing_payment_source: item.sourcing_payment_source ?? "cash_drawer",
                  sourcing_partner: item.sourcing_partner ?? "",
                }
              : {}),
          };
        })
        .filter((item): item is CartItem => item !== null);

      // Items whose physical product was deleted while the sale was held are dropped by the filter above.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-held-transactions-ts-L126
      const missingCount = items.length - restoredItems.length;

      const hasDeactivatedService = items.some((item) => {
        if (item.item_type === "service") {
          const service = serviceFor(item);
          return !service || !service.is_active;
        }
        return false;
      });

      const hasRepricedProduct = items.some((item) => {
        if (item.item_type === "service") return false;
        const product = productFor(item);
        const heldBasePrice = item.original_unit_price ?? item.unit_price;
        return !!product && product.unit_price !== heldBasePrice;
      });

      const hasRepricedService = items.some((item) => {
        if (item.item_type === "service") {
          const service = serviceFor(item);
          return !!service && service.price !== item.unit_price;
        }
        return false;
      });

      // 2. Delete the held row BEFORE touching cart state.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-held-transactions-ts-L141
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
      if (hasRepricedProduct) {
        toast.info(
          "Some product prices have changed since this sale was held and were updated to current pricing.",
        );
      }
      if (hasRepricedService) {
        toast.info(
          "Catalog prices have changed for some services since held; original agreed pricing was preserved.",
        );
      }
      if (hasDeactivatedService) {
        toast.warning(
          "One or more services in this held sale are no longer active in the catalog. Preserved agreed quote.",
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

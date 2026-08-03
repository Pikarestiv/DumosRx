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
  selectedCustomer: Customer | null;
  clearCart: () => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  products: Product[];
  restoreCart: (items: CartItem[]) => void;
  customers: Customer[];
  setShowHeldDialog: (show: boolean) => void;
}

export function usePOSHeldTransactions({
  cart,
  total,
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
        created_at: new Date().toISOString(),
      });

      toast.success("Transaction held successfully");
      clearCart();
      setSelectedCustomer(null);
      
      // Invalidate the count query to update the UI
      queryClient.invalidateQueries(queryKeys.heldTransactions.count());
    } catch (err) {
      console.error(err);
      toast.error("Failed to hold transaction");
    }
  };

  const handleRecallTransaction = async (held: HeldTransaction) => {
    try {
      // 1. Clear current cart (maybe ask user?)
      clearCart();

      // 2. Parse items and add to cart
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
            };
          }
          return null;
        })
        .filter((item): item is CartItem => item !== null);

      restoreCart(restoredItems);

      if (held.customer_id) {
        const customer = customers.find((c) => c.id === held.customer_id);
        if (customer) setSelectedCustomer(customer);
      }

      // 3. Delete from held
      await remove("held_transactions", held.id);

      toast.success("Transaction recalled");
      setShowHeldDialog(false);
      
      // Invalidate the count query to update the UI
      queryClient.invalidateQueries(queryKeys.heldTransactions.count());
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

import { insert, remove } from "@/lib/db/local-database";
import { toast } from "sonner";
import { Customer, Product } from "./use-pos-data";

interface UsePOSHeldTransactionsProps {
  cart: any[];
  total: number;
  selectedCustomer: Customer | null;
  clearCart: () => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  products: Product[];
  restoreCart: (items: any[]) => void;
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
    } catch (err) {
      console.error(err);
      toast.error("Failed to hold transaction");
    }
  };

  const handleRecallTransaction = async (held: any) => {
    try {
      // 1. Clear current cart (maybe ask user?)
      clearCart();

      // 2. Parse items and add to cart
      const items = JSON.parse(held.items_json);
      const restoredItems = items
        .map((item: any) => {
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
        .filter((item: any) => item !== null) as any;

      restoreCart(restoredItems);

      if (held.customer_id) {
        const customer = customers.find((c) => c.id === held.customer_id);
        if (customer) setSelectedCustomer(customer);
      }

      // 3. Delete from held
      await remove("held_transactions", held.id);

      toast.success("Transaction recalled");
      setShowHeldDialog(false);
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

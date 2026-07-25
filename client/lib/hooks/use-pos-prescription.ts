import { useEffect, useState } from "react";
import { getPrescriptionItems } from "@/lib/db/queries/prescriptions";
import { toast } from "sonner";
import type { POSProduct as Product } from "@/lib/types/product";

interface UsePOSPrescriptionProps {
  searchParams: URLSearchParams;
  products: Product[];
  cartLength: number;
  restoreCart: (items: any[]) => void;
  router: any;
  pathname: string;
}

export function usePOSPrescription({
  searchParams,
  products,
  cartLength,
  restoreCart,
  router,
  pathname,
}: UsePOSPrescriptionProps) {
  const [dispensedRxId, setDispensedRxId] = useState<string | null>(null);
  const [isRefillDispense, setIsRefillDispense] = useState(false);

  useEffect(() => {
    const rxId = searchParams.get("dispense_rx");
    if (rxId && products.length > 0 && cartLength === 0) {
      const isRefill = searchParams.get("refill") === "1";
      const loadPrescription = async () => {
        try {
          // fetch prescription items
          const itemsData = await getPrescriptionItems(rxId);

          // update prescription status to in_progress or dispensed
          // The POS handles final sale, but let's just load the cart for now.
          const restoredItems = itemsData
            .map((item: any) => {
              const product = products.find(
                (m) =>
                  m.name === item.product_name && m.strength === item.strength,
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

          if (restoredItems.length > 0) {
            restoreCart(restoredItems);
            toast.success(isRefill ? "Refill loaded into POS" : "Prescription loaded into POS");
            setDispensedRxId(rxId);
            setIsRefillDispense(isRefill);
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete("dispense_rx");
            newParams.delete("refill");
            router.replace(`${pathname}?${newParams.toString()}`);
          } else {
            toast.error("Could not match prescription items to stock batch.");
          }
        } catch (error) {
          console.error("Failed to load prescription to POS:", error);
          toast.error("Failed to load prescription.");
        }
      };
      loadPrescription();
    }
  }, [searchParams, products, cartLength, restoreCart, router, pathname]);

  return { dispensedRxId, setDispensedRxId, isRefillDispense };
}

import { useEffect } from "react";
import { query } from "@/lib/db/local-database";
import { toast } from "sonner";
import { Medicine } from "./use-pos-data";

interface UsePOSPrescriptionProps {
  searchParams: URLSearchParams;
  medicines: Medicine[];
  cartLength: number;
  restoreCart: (items: any[]) => void;
  router: any;
  pathname: string;
}

export function usePOSPrescription({
  searchParams,
  medicines,
  cartLength,
  restoreCart,
  router,
  pathname,
}: UsePOSPrescriptionProps) {
  useEffect(() => {
    const rxId = searchParams.get("dispense_rx");
    if (rxId && medicines.length > 0 && cartLength === 0) {
      const loadPrescription = async () => {
        try {
          // fetch prescription items
          const itemsData = await query(
            "SELECT * FROM prescription_items WHERE prescription_id = ? AND _deleted = 0",
            [rxId],
          );

          // update prescription status to in_progress or dispensed
          // The POS handles final sale, but let's just load the cart for now.
          const restoredItems = itemsData
            .map((item: any) => {
              const medicine = medicines.find(
                (m) =>
                  m.name === item.medicine_name && m.strength === item.strength,
              );
              if (medicine) {
                return {
                  ...medicine,
                  quantity: item.quantity,
                  subtotal: medicine.unit_price * item.quantity,
                };
              }
              return null;
            })
            .filter((item: any) => item !== null) as any;

          if (restoredItems.length > 0) {
            restoreCart(restoredItems);
            toast.success("Prescription loaded into POS");
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete("dispense_rx");
            router.replace(`${pathname}?${newParams.toString()}`);
          } else {
            toast.error("Could not match prescription items to inventory.");
          }
        } catch (error) {
          console.error("Failed to load prescription to POS:", error);
          toast.error("Failed to load prescription.");
        }
      };
      loadPrescription();
    }
  }, [searchParams, medicines, cartLength, restoreCart, router, pathname]);
}

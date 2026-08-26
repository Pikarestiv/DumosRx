import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getSaleById } from "@/lib/db/queries/sales";
import type { SaleWithDetails } from "@/lib/types/sale";

interface UsePOSReturnDeepLinkProps {
  searchParams: URLSearchParams;
  router: ReturnType<typeof useRouter>;
  pathname: string;
  setSaleToReturn: (sale: SaleWithDetails) => void;
  setShowReturnDialog: (open: boolean) => void;
}

/**
 * Deep-link from the prescription detail panel's "Process Return" action
 * (?return_sale=<id>): jumps straight into the return dialog for that sale
 * instead of making the cashier hunt for it in the history tab.
 */
export function usePOSReturnDeepLink({
  searchParams,
  router,
  pathname,
  setSaleToReturn,
  setShowReturnDialog,
}: UsePOSReturnDeepLinkProps) {
  useEffect(() => {
    const returnSaleId = searchParams.get("return_sale");
    if (!returnSaleId) return;

    const loadSale = async () => {
      const sale = await getSaleById(returnSaleId);
      if (sale) {
        setSaleToReturn(sale);
        setShowReturnDialog(true);
      } else {
        toast.error("Could not find that sale.");
      }
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("return_sale");
      router.replace(`${pathname}?${newParams.toString()}`);
    };
    loadSale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}

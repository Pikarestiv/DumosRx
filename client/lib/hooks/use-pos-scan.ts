import { toast } from "sonner";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import type { POSProduct } from "@/lib/types/product";

interface Params {
  products: POSProduct[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  addToCart: (product: POSProduct) => void;
  onMultipleMatches?: (matches: POSProduct[], scannedBarcode: string) => void;
}

/** Barcode-scan handling for the POS search box: Enter-to-scan and the shared scan-success lookup. */
export function usePOSScan({
  products,
  searchTerm,
  setSearchTerm,
  addToCart,
  onMultipleMatches,
}: Params) {
  const displayName = useDisplayName();

  const handleScanSuccess = (scannedBarcode: string) => {
    const query = scannedBarcode.toLowerCase().trim();
    const matches = products.filter(
      (m) =>
        m.barcode?.toLowerCase() === query ||
        m.batch_number?.toLowerCase() === query,
    );

    if (matches.length === 1) {
      addToCart(matches[0]);
      setSearchTerm("");
      toast.success(`Scanned: ${displayName(matches[0].name)}`);
    } else if (matches.length > 1) {
      if (onMultipleMatches) {
        onMultipleMatches(matches, scannedBarcode);
        setSearchTerm("");
      } else {
        addToCart(matches[0]);
        setSearchTerm("");
        toast.info(
          `Multiple items have this barcode. Added ${displayName(matches[0].name)}.`,
        );
      }
    } else {
      toast.error(`No product found for barcode: ${scannedBarcode}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      handleScanSuccess(searchTerm.trim());
    }
  };

  return { handleKeyPress, handleScanSuccess };
}

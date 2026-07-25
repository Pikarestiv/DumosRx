import { toast } from "sonner";

interface Params {
  products: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  addToCart: (product: any) => void;
}

/** Barcode-scan handling for the POS search box: Enter-to-scan and the shared scan-success lookup. */
export function usePOSScan({ products, searchTerm, setSearchTerm, addToCart }: Params) {
  const handleScanSuccess = (scannedBarcode: string) => {
    const query = scannedBarcode.toLowerCase().trim();
    const barcodeMatch = products.find(
      (m) =>
        m.barcode?.toLowerCase() === query ||
        m.batch_number?.toLowerCase() === query,
    );
    if (barcodeMatch) {
      addToCart(barcodeMatch);
      setSearchTerm("");
      toast.success(`Scanned: ${barcodeMatch.name}`);
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

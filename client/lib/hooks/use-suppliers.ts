import { useState, useEffect } from 'react';
import { getAllVendors, FullVendor } from '../db/queries/procurement';

export function useSupplierList() {
  const [vendors, setVendors] = useState<FullVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVendors = async () => {
    setIsLoading(true);
    try {
      const data = await getAllVendors();
      setVendors(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch vendors:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  return { vendors, isLoading, error, refetch: fetchVendors };
}

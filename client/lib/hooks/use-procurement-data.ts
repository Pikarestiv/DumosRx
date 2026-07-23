import { useState, useEffect, useCallback } from 'react';
import { getActiveSuppliersForPO, getActiveProductsForPO, POVendor, POProduct } from '../db/queries/procurement';

export function useProcurementData() {
  const [suppliers, setSuppliers] = useState<POVendor[]>([]);
  const [products, setProducts] = useState<POProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vendorData, productData] = await Promise.all([
        getActiveSuppliersForPO(),
        getActiveProductsForPO()
      ]);
      setSuppliers(vendorData);
      setProducts(productData);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch procurement data:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  return { suppliers, products, loading, error, refetch: fetchData };
}

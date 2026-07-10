import { useState, useEffect } from 'react';
import { getProductsForAudit, AuditProduct, getExpiringBatches, ExpiringItem } from '../db/queries/inventory';

export function useStockAudit() {
  const [products, setProducts] = useState<AuditProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const data = await getProductsForAudit();
      setProducts(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch products for audit:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, isLoading, error, refetch: fetchProducts };
}

export function useExpiringBatches(days: number) {
  const [items, setItems] = useState<ExpiringItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBatches = async () => {
    setIsLoading(true);
    try {
      const data = await getExpiringBatches(days);
      setItems(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch expiring batches:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [days]);

  return { items, isLoading, error, refetch: fetchBatches };
}

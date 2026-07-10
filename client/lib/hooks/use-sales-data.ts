import { useState, useEffect } from 'react';
import { getHeldTransactions, HeldTransaction } from '../db/queries/sales';

export function useHeldTransactions() {
  const [heldItems, setHeldItems] = useState<HeldTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchHeldTransactions = async () => {
    setLoading(true);
    try {
      const data = await getHeldTransactions();
      setHeldItems(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch held transactions:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeldTransactions();
  }, []);

  return { heldItems, loading, error, refetch: fetchHeldTransactions };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import {
  getStockMovements,
  getStockAdjustments,
} from "@/lib/db/local-database";
import { insert } from "@/lib/db/base-helpers";

export function useStockMovements(page = 1, limit = 50) {
  return useQuery({
    queryKey: [...queryKeys.stock_batch(), "movements", { page, limit }],
    queryFn: () => getStockMovements(page, limit),
  });
}

export function useStockAdjustments(page = 1, limit = 50) {
  return useQuery({
    queryKey: [...queryKeys.stock_batch(), "adjustments", { page, limit }],
    queryFn: () => getStockAdjustments(page, limit),
  });
}

export function useMutateStockBatch() {
  const queryClient = useQueryClient();

  const adjustStock = useMutation({
    mutationFn: async (data: any) => {
      // Custom logic for stock adjustment could go here or we just rely on insert for now
      const id = await insert("stock_movements", data);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stock_batch() });
      queryClient.invalidateQueries({ queryKey: queryKeys.products() }); // Adjusting stock affects product quantities
      queryClient.invalidateQueries({ queryKey: ["localData"] });
    },
  });

  return { adjustStock };
}

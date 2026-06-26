import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { getMedicines, getMedicineById, createMedicine } from "@/lib/db/local-database";
import { update, softDelete } from "@/lib/db/base-helpers";

export function useMedicines(page = 1, limit = 50, search = "") {
  return useQuery({
    queryKey: [...queryKeys.medicines(), { page, limit, search }],
    queryFn: () => getMedicines(page, limit, search),
  });
}

export function useMedicine(id: string) {
  return useQuery({
    queryKey: [...queryKeys.medicines(), id],
    queryFn: () => getMedicineById(id),
    enabled: !!id,
  });
}

export function useMutateMedicine() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (data: any) => createMedicine(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.medicines() });
      queryClient.invalidateQueries({ queryKey: ['localData'] });
    },
  });

  const updateMedicine = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => update("medicines", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.medicines() });
      queryClient.invalidateQueries({ queryKey: ['localData'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => softDelete("medicines", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.medicines() });
      queryClient.invalidateQueries({ queryKey: ['localData'] });
    },
  });

  return { create, update: updateMedicine, remove };
}

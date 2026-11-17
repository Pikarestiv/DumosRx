import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearServiceCategory, getServices, renameServiceCategory } from "@/lib/db/queries/services";
import { queryKeys } from "@/lib/query-keys";
import { useStore } from "@/lib/context/store-context";
import { groupServiceCategories } from "@/lib/utils/service-category";

export function useServiceCategories() {
  const { activeStoreId } = useStore();
  const { data: services = [] } = useQuery({
    ...queryKeys.services.all(),
    queryFn: () => getServices({ storeId: activeStoreId, activeOnly: false }),
  });
  return useMemo(() => groupServiceCategories(services), [services]);
}

export function useServiceCategoryMutations() {
  const queryClient = useQueryClient();
  const { activeStoreId } = useStore();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.services.all().queryKey });

  const rename = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => renameServiceCategory(from, to, activeStoreId),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (name: string) => clearServiceCategory(name, activeStoreId),
    onSuccess: refresh,
  });
  return { rename, remove };
}

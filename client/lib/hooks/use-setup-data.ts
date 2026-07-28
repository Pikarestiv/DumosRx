import { useQuery } from "@tanstack/react-query";
import { getTotalRecordCount } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";

export function useRecordCounts() {
  return useQuery({
    ...queryKeys.setup.totalRecordCount(),
    queryFn: () => getTotalRecordCount()
  });
}

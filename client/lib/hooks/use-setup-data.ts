import { useQuery } from "@tanstack/react-query";
import { getTotalRecordCount } from "@/lib/db/queries/setup";

export function useRecordCounts() {
  return useQuery({
    queryKey: ['setupData', 'totalRecordCount'],
    queryFn: () => getTotalRecordCount()
  });
}

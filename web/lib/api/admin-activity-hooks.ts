import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { PaginatedResponse, ActivityLog } from "@/lib/types/admin";

export const useAdminActivityLogs = (
  page = 1,
  search = "",
  action = "",
  storeId = "",
  userId = "",
  dateFrom = "",
  dateTo = "",
) => {
  return useQuery({
    queryKey: useScopedKey(["admin-activity-logs", page, search, action, storeId, userId, dateFrom, dateTo]),
    queryFn: () =>
      webApiClient.request<PaginatedResponse<ActivityLog>>(
        `admin/activity-logs?page=${page}` +
          (search ? `&search=${encodeURIComponent(search)}` : "") +
          (action ? `&action=${encodeURIComponent(action)}` : "") +
          (storeId ? `&store_id=${encodeURIComponent(storeId)}` : "") +
          (userId ? `&user_id=${encodeURIComponent(userId)}` : "") +
          (dateFrom ? `&date_from=${encodeURIComponent(dateFrom)}` : "") +
          (dateTo ? `&date_to=${encodeURIComponent(dateTo)}` : ""),
      ),
  });
};

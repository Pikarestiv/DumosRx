import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
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
    queryKey: ["admin-activity-logs", page, search, action, storeId, userId, dateFrom, dateTo],
    queryFn: () =>
      webApiClient.request<PaginatedResponse<ActivityLog>>(
        `admin/activity-logs?page=${page}` +
          (search ? `&search=${search}` : "") +
          (action ? `&action=${action}` : "") +
          (storeId ? `&store_id=${storeId}` : "") +
          (userId ? `&user_id=${userId}` : "") +
          (dateFrom ? `&date_from=${dateFrom}` : "") +
          (dateTo ? `&date_to=${dateTo}` : ""),
      ),
  });
};

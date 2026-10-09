import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";

export interface AdminTillCode {
  id: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
}

/** The maximum the server will hold active per admin; see
 * laravel-server's AdminTillSessionService::EQUALIZED_CHECKS. */
export const MAX_ACTIVE_TILL_CODES = 3;

export const useMyTillCodes = (enabled = true) =>
  useQuery({
    queryKey: useScopedKey(["admin-till-codes"]),
    queryFn: () => webApiClient.request<{ codes: AdminTillCode[] }>("admin/till-codes/mine"),
    enabled,
  });

export const useIssueTillCodeMutation = () => {
  const queryClient = useQueryClient();
  const key = useScopedKey(["admin-till-codes"]);

  return useMutation({
    mutationFn: (label: string | null) =>
      webApiClient.request<{ id: string; code: string }>("admin/till-codes", {
        method: "POST",
        body: { label },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

export const useRevokeTillCodeMutation = () => {
  const queryClient = useQueryClient();
  const key = useScopedKey(["admin-till-codes"]);

  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<{ ok: boolean }>(`admin/till-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

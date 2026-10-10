import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";

export interface AdminTillCode {
  id: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
}

/** A code in clear, for the super_admin-only reveal. `code` is null for a row
 * issued before codes were stored recoverably. */
export interface AdminTillCodeReveal extends AdminTillCode {
  admin_email: string | null;
  admin_name: string;
  code: string | null;
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

/** super_admin only, server-side, and every call is written to the activity
 * log — so it stays disabled until the viewer explicitly asks to reveal. */
export const useAllTillCodes = (enabled: boolean) =>
  useQuery({
    queryKey: useScopedKey(["admin-till-codes", "all"]),
    queryFn: () =>
      webApiClient.request<{ codes: AdminTillCodeReveal[] }>("admin/till-codes/all"),
    enabled,
    staleTime: 0,
    gcTime: 0,
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

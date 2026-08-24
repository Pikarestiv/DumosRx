import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { EmailTemplatesResponse, FeedbackItem } from "@/lib/types/admin";

export const useAdminFeedback = (status: string = "all") => {
  return useQuery({
    queryKey: useScopedKey(["admin-feedback", status]),
    queryFn: () => webApiClient.getFeedback(status) as Promise<{ data: FeedbackItem[] }>,
  });
};

export const useUpdateFeedbackStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      webApiClient.updateFeedbackStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
  });
};

// Email Templates Hooks
export const useAdminEmailTemplates = () => {
  return useQuery({
    queryKey: useScopedKey(["admin-email-templates"]),
    queryFn: () => webApiClient.request<EmailTemplatesResponse>("admin/email-templates"),
  });
};

export const useUpdateAdminEmailTemplateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, subject, body }: { key: string; subject: string; body: string }) =>
      webApiClient.request<unknown>(`admin/email-templates/${key}`, {
        method: "PUT",
        body: { subject, body },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
  });
};

// Broadcast Hooks
export const useDeleteBroadcastMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.deleteBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
  });
};

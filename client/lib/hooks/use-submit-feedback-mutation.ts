import { useMutation } from "@tanstack/react-query";
import { insert } from "@/lib/db/local-database";

interface SubmitFeedbackParams {
  userId: string;
  type: string;
  content: string;
  email: string;
}

export function useSubmitFeedbackMutation() {
  return useMutation({
    mutationFn: ({ userId, type, content, email }: SubmitFeedbackParams) =>
      insert("feedback", {
        id: crypto.randomUUID(),
        user_id: userId,
        type,
        content,
        contact_email: email,
        status: "pending",
        created_at: new Date().toISOString(),
        _synced: 0,
      }),
  });
}

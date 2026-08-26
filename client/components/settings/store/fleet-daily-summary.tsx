"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useSubscriptionStatus } from "@/lib/hooks/use-billing";
import { apiClient } from "@/lib/api/client";

export function FleetDailySummary() {
  const [sending, setSending] = useState(false);
  const { data: subStatus } = useSubscriptionStatus();

  const canSendSummary =
    subStatus?.features?.auto_backup ??
    (subStatus?.plan !== "starter" && subStatus?.plan !== "free");

  const syncInterval = subStatus?.limits?.sync_interval ?? 0;

  const handleSend = async () => {
    setSending(true);
    try {
      const response = await apiClient.sendEndOfDaySummary();
      toast.success(response.message || "Summary sent successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "This is a premium feature. Please upgrade your plan to access it.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {syncInterval > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex items-start gap-2 text-sm">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Dashboard data syncs every {syncInterval} minutes on your current plan. Upgrade for
            real-time sync.
          </span>
        </div>
      )}
      {canSendSummary && (
        <Button variant="outline" onClick={handleSend} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send Daily Summary
        </Button>
      )}
    </div>
  );
}

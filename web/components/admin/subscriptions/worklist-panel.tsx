"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { StorePagination } from "@/components/admin/stores/store-pagination";
import { SharedGrantTrialDialog } from "@/components/admin/shared-grant-trial-dialog";
import { SharedActivatePlanDialog } from "@/components/admin/shared-activate-plan-dialog";
import { SendNotificationDialog } from "@/components/admin/users/send-notification-dialog";
import { useAdminSubscriptionBucket } from "@/lib/api/admin-hooks-subscriptions";
import { useResettingPage } from "@/hooks/use-resetting-page";
import {
  useGrantUserTrialMutation,
  useActivateUserPlanMutation,
  useNotifyUserMutation,
} from "@/lib/api/admin-hooks-users";
import type { AdminUser } from "@/lib/types/admin";
import { WorklistTable } from "./worklist-table";
import type { SubscriptionBucket, SubscriptionWorklistRow } from "@/lib/types/admin";

interface WorklistPanelProps {
  bucket: SubscriptionBucket;
  days: number;
  canGrantTrials: boolean;
  canNotify: boolean;
}

const asAdminUser = (row: SubscriptionWorklistRow): AdminUser => ({
  id: row.user_id,
  name: row.owner_name,
  email: row.email,
  role: "Store Owner",
  role_slug: "store_owner",
  store: row.store_name ?? undefined,
  store_id: row.store_id,
  status: "Active",
});

export function WorklistPanel({ bucket, days, canGrantTrials, canNotify }: WorklistPanelProps) {
  const [page, setPage] = useResettingPage(days);
  const [trialTarget, setTrialTarget] = useState<SubscriptionWorklistRow | null>(null);
  const [planTarget, setPlanTarget] = useState<SubscriptionWorklistRow | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<SubscriptionWorklistRow | null>(null);

  const { data, isLoading } = useAdminSubscriptionBucket(bucket, days, page);
  const grantTrial = useGrantUserTrialMutation();
  const activatePlan = useActivateUserPlanMutation();
  const notify = useNotifyUserMutation();

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <WorklistTable
            rows={rows}
            bucket={bucket}
            isLoading={isLoading}
            canGrantTrials={canGrantTrials}
            canNotify={canNotify}
            onGrantTrial={setTrialTarget}
            onActivatePlan={setPlanTarget}
            onNotify={setNotifyTarget}
          />
        </div>

        {meta && <StorePagination meta={meta} onPageChange={setPage} />}
      </CardContent>

      <SharedGrantTrialDialog
        open={trialTarget !== null}
        onOpenChange={(open) => !open && setTrialTarget(null)}
        targetName={trialTarget?.owner_name}
        isPending={grantTrial.isPending}
        onConfirm={(plan, duration, endDate) => {
          if (!trialTarget) return;
          grantTrial.mutate(
            { id: trialTarget.user_id, plan, duration, endDate },
            {
              onSuccess: () => {
                toast.success(`Trial granted to ${trialTarget.owner_name}`);
                setTrialTarget(null);
              },
            },
          );
        }}
      />

      <SharedActivatePlanDialog
        open={planTarget !== null}
        onOpenChange={(open) => !open && setPlanTarget(null)}
        targetName={planTarget?.owner_name}
        isPending={activatePlan.isPending}
        onConfirm={(plan, billingCycle, amount, reference) => {
          if (!planTarget) return;
          activatePlan.mutate(
            { id: planTarget.user_id, plan, billingCycle, amount, reference },
            {
              onSuccess: () => {
                toast.success(`Plan activated for ${planTarget.owner_name}`);
                setPlanTarget(null);
              },
            },
          );
        }}
      />

      <SendNotificationDialog
        isOpen={notifyTarget !== null}
        onOpenChange={(open) => !open && setNotifyTarget(null)}
        selectedUser={notifyTarget ? asAdminUser(notifyTarget) : null}
        setSelectedUser={() => setNotifyTarget(null)}
        notifyMutation={notify}
      />
    </Card>
  );
}

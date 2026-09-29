"use client";

import { useState } from "react";
import { Headset, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAccountManagerCandidates,
  useUpdateAccountManagerMutation,
} from "@/lib/api/admin-hooks-stores";
import { DetailCard } from "./store-detail-primitives";
import type { AdminStoreDetail } from "@/lib/types/admin";

const UNASSIGNED = "__unassigned__";

export function AccountManagerCard({ store }: { store: AdminStoreDetail }) {
  const { data: candidatesData } = useAccountManagerCandidates();
  const updateAccountManager = useUpdateAccountManagerMutation();

  const resolvedManagerId =
    store.account_manager_is_explicit && store.account_manager
      ? store.account_manager.id
      : UNASSIGNED;

  const [managerId, setManagerId] = useState<string>(resolvedManagerId);
  const [prevResolvedManagerId, setPrevResolvedManagerId] = useState(resolvedManagerId);

  if (resolvedManagerId !== prevResolvedManagerId) {
    setPrevResolvedManagerId(resolvedManagerId);
    setManagerId(resolvedManagerId);
  }

  const candidates = candidatesData?.data ?? [];

  const handleSave = () => {
    updateAccountManager.mutate(
      {
        storeId: store.id,
        accountManagerId: managerId === UNASSIGNED ? null : managerId,
      },
      {
        onSuccess: () =>
          toast.success("Contact specialist updated", {
            description: `${store.name}'s account manager was reassigned.`,
          }),
        onError: () =>
          toast.error("Failed to update the contact specialist. Please try again."),
      },
    );
  };

  return (
    <DetailCard title="Contact Specialist" icon={<Headset className="h-4 w-4" />}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {store.account_manager_is_explicit
          ? "Explicitly assigned."
          : store.account_manager
            ? `Currently "${store.account_manager.name}" via referral/default, not explicitly assigned.`
            : "No contact specialist resolved."}
      </p>
      <div className="min-w-0 space-y-3">
        <Select value={managerId} onValueChange={setManagerId}>
          <SelectTrigger className="rounded-xl w-full">
            <SelectValue placeholder="Use referral/default">
              {managerId === UNASSIGNED
                ? "Use referral/default"
                : (candidates.find((c) => c.id === managerId)?.name ?? "Use referral/default")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Use referral/default</SelectItem>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.role}) - {c.email}
                {c.phone ? ` - ${c.phone}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl font-bold"
          onClick={handleSave}
          disabled={updateAccountManager.isPending}
        >
          {updateAccountManager.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Save Assignment
        </Button>
      </div>
    </DetailCard>
  );
}

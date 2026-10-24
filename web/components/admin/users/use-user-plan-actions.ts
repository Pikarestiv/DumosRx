import { useState } from "react";
import { toast } from "sonner";
import {
  useActivateUserPlanMutation,
  useGrantUserTrialMutation,
} from "@/lib/api/admin-hooks";
import type { AdminUser } from "@/lib/types/admin";

export function useUserPlanActions(
  selectedUser: AdminUser | null,
  setSelectedUser: (user: AdminUser | null) => void,
  onChanged: () => void,
) {
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  const [isActivatePlanDialogOpen, setIsActivatePlanDialogOpen] = useState(false);
  const grantTrialMutation = useGrantUserTrialMutation();
  const activatePlanMutation = useActivateUserPlanMutation();

  const handleGrantTrial = (plan: string, duration?: string, endDate?: string) => {
    if (!selectedUser) return;

    grantTrialMutation.mutate({ id: selectedUser.id, plan, duration, endDate }, {
      onSuccess: () => {
        const durationLabel = endDate ? `until ${endDate}` : duration;
        toast.success("Trial Granted", {
          description: `Granted ${durationLabel} ${plan} trial to ${selectedUser.name}.`,
        });
        setIsTrialDialogOpen(false);
        setSelectedUser(null);
        onChanged();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to grant trial.",
        });
      }
    });
  };

  const handleActivatePlan = (plan: string, billingCycle: string, amount: number, reference?: string) => {
    if (!selectedUser) return;

    activatePlanMutation.mutate({ id: selectedUser.id, plan, billingCycle, amount, reference }, {
      onSuccess: () => {
        toast.success("Plan Activated", {
          description: `Activated ${billingCycle} ${plan} plan for ${selectedUser.name}.`,
        });
        setIsActivatePlanDialogOpen(false);
        setSelectedUser(null);
        onChanged();
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to activate plan.",
        });
      }
    });
  };

  return {
    isTrialDialogOpen,
    setIsTrialDialogOpen,
    isActivatePlanDialogOpen,
    setIsActivatePlanDialogOpen,
    handleGrantTrial,
    handleActivatePlan,
    isGrantingTrial: grantTrialMutation.isPending,
    isActivatingPlan: activatePlanMutation.isPending,
  };
}

"use client";

import { ShieldAlert, Check } from "lucide-react";
import { capitalizeFirstLetter } from "@/lib/utils";

export function SubscriptionStatusAlert({ subStatus }: { subStatus: any }) {
  if (!subStatus) return null;

  if (subStatus.status === "inactive") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
        <div className="space-y-1">
          <p className="font-medium">No Active Subscription / Expired</p>
          <p className="text-sm">
            Upgrade or renew your plan below to ensure your cloud data
            remains protected.
          </p>
        </div>
      </div>
    );
  }

  if (subStatus.status === "active") {
    const daysLeft = Math.floor(Number(subStatus.days_remaining ?? 0));
    const isTrial = subStatus.is_trial === true;
    const isFreePlan = subStatus.plan?.toLowerCase().includes("free");
    const isExpiringSoon = daysLeft < 7 && !isFreePlan;

    if (isTrial || isExpiringSoon) {
      return (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">
              {isTrial
                ? `You are on the ${capitalizeFirstLetter(subStatus.plan || "Free")} Trial (${daysLeft} Days Remaining)`
                : `You are on the ${capitalizeFirstLetter(subStatus.plan)} Plan${isExpiringSoon ? ` (${daysLeft} Days Remaining)` : ""}`}
            </p>
            <p className="text-sm">
              {isTrial
                ? "Upgrade or subscribe to a paid plan below to ensure your cloud data remains protected."
                : "Your subscription is expiring soon. Please renew to ensure your cloud data remains protected."}
            </p>
          </div>
        </div>
      );
    }

    if (isFreePlan) {
      return (
        <div className="bg-slate-50 border border-slate-200 text-slate-800 p-4 rounded-lg flex items-start gap-3">
          <Check className="h-5 w-5 mt-0.5 shrink-0 text-slate-600" />
          <div className="space-y-1">
            <p className="font-medium">
              You are on the {capitalizeFirstLetter(subStatus.plan)} Plan
            </p>
            <p className="text-sm">
              Your local standalone workspace is active and ready. Upgrade to sync your data to the cloud.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-start gap-3">
        <Check className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
        <div className="space-y-1">
          <p className="font-medium">
            You are on the {capitalizeFirstLetter(subStatus.plan)} Plan
          </p>
          <p className="text-sm">
            Your subscription is active. Thank you for protecting your cloud data with DumosRx.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

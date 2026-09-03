"use client";

import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface LockedModuleOverlayProps {
  featureName: string;
  featureKey: "prescriptions" | "procurement" | "expenses" | "audit" | "loyalty_program";
}

export function LockedModuleOverlay({ featureName, featureKey }: LockedModuleOverlayProps) {
  const {
    canUsePrescriptions,
    canUseProcurement,
    canUseExpenses,
    canUseAuditMode,
    canUseLoyaltyProgram,
    getUpgradeMessage
  } = useFeatureGate();

  let isLocked = false;
  if (featureKey === "prescriptions") isLocked = !canUsePrescriptions;
  else if (featureKey === "procurement") isLocked = !canUseProcurement;
  else if (featureKey === "expenses") isLocked = !canUseExpenses;
  else if (featureKey === "audit") isLocked = !canUseAuditMode;
  else if (featureKey === "loyalty_program") isLocked = !canUseLoyaltyProgram;

  if (!isLocked) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-md rounded-xl border border-white/5 animate-in fade-in duration-300">
      <div className="max-w-md w-full mx-4 p-8 bg-card/85 backdrop-blur-lg border border-border/50 shadow-2xl rounded-2xl flex flex-col items-center text-center space-y-5">
        <div className="w-14 h-14 bg-destructive/10 text-destructive rounded-full flex items-center justify-center shadow-inner">
          <Lock className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold font-serif tracking-tight">Unlock Premium Feature</h3>
          <p className="text-sm text-muted-foreground leading-relaxed px-2">
            The <span className="font-semibold text-foreground">{featureName}</span> module is locked. {getUpgradeMessage(featureKey, "Upgrade now to keep your store organized.")}
          </p>
        </div>
        <Button
          className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-bold shadow-lg shadow-primary/20 h-11"
          asChild
        >
          <Link href="/settings/billing">Upgrade Plan</Link>
        </Button>
      </div>
    </div>
  );
}

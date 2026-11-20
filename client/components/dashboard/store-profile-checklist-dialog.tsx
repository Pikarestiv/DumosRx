"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore, type StoreProfile } from "@/lib/context/store-context";

interface StoreProfileChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChecklistItem {
  key: keyof StoreProfile;
  label: string;
  description: string;
  isFilled: boolean;
}

export function StoreProfileChecklistDialog({
  open,
  onOpenChange,
}: StoreProfileChecklistDialogProps) {
  const router = useRouter();
  const { storeProfile } = useStore();

  const isPharmacy = storeProfile?.store_type === "pharmacy";

  const checklist: ChecklistItem[] = [
    {
      key: "name",
      label: "Business Name",
      description: "Appears on your receipt header and sales reports",
      isFilled: Boolean(storeProfile?.name?.trim()),
    },
    {
      key: "address",
      label: "Store Address",
      description: "Physical location printed on customer receipts",
      isFilled: Boolean(storeProfile?.address?.trim()),
    },
    {
      key: "phone",
      label: "Phone Number",
      description: "Contact number for customer support and invoices",
      isFilled: Boolean(storeProfile?.phone?.trim()),
    },
    {
      key: "email",
      label: "Email Address",
      description: "Business email address for notifications and reports",
      isFilled: Boolean(storeProfile?.email?.trim()),
    },
    {
      key: "logo_url",
      label: "Store Logo",
      description: "Brand logo shown on printable invoices and receipts",
      isFilled: Boolean(storeProfile?.logo_url?.trim()),
    },
  ];

  if (isPharmacy) {
    checklist.push({
      key: "pcn_license",
      label: "PCN License / Premises Permit",
      description: "Pharmacy regulatory license for compliance verification",
      isFilled: Boolean(storeProfile?.pcn_license?.trim()),
    });
  }

  const completedCount = checklist.filter((item) => item.isFilled).length;
  const percentage = Math.round((completedCount / checklist.length) * 100);

  const handleNavigateToSettings = () => {
    onOpenChange(false);
    router.push("/settings/business-info");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
        <DialogHeader className="text-left space-y-1.5">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wide uppercase">
            <Settings className="w-3.5 h-3.5" />
            Profile Completion
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Complete Your Store Profile
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Fill in these details to generate professional customer receipts and reports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">{completedCount} of {checklist.length} details provided</span>
              <span className="text-foreground font-semibold">{percentage}%</span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>

          <div className="divide-y divide-border/50 border border-border/50 rounded-2xl overflow-hidden bg-muted/20">
            {checklist.map((item) => (
              <div
                key={item.key}
                className="flex items-start justify-between gap-3 p-3 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  {item.isFilled ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <span className={`font-semibold ${item.isFilled ? "text-foreground" : "text-foreground/80"}`}>
                      {item.label}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                    item.isFilled
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  {item.isFilled ? "Done" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row sm:justify-between items-center gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Later
          </Button>
          <Button
            size="sm"
            onClick={handleNavigateToSettings}
            className="text-xs bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
          >
            Update in Settings
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ReferralProgramSettings } from "./types";

import { ReferralsSummaryCards } from "./referrals-summary-cards";
import { ReferralsSettingsForm } from "./referrals-settings-form";
import { ReferralsRelationshipsTable } from "./referrals-relationships-table";
import { ReferralsAuditLog } from "./referrals-audit-log";
import { ReferralsAdjustDialog } from "./referrals-adjust-dialog";

import {
  useAdminUsers,
  useReferralsSummary,
  useReferralsSettings,
  useReferralsRelationships,
  useReferralsTransactions,
  useUpdateReferralsSettingsMutation,
  useAdjustReferralsCreditsMutation,
} from "@/lib/api/admin-hooks";

export function ReferralsManager() {
  const { data: summaryData, isLoading: loadingSummary } = useReferralsSummary();
  const { data: settingsData, isLoading: loadingSettings } = useReferralsSettings();
  const { data: referralsData, isLoading: loadingReferrals } = useReferralsRelationships();
  const { data: transactionsData, isLoading: loadingTransactions } = useReferralsTransactions();
  const { data: usersData, isLoading: loadingUsers } = useAdminUsers();

  const updateSettingsMutation = useUpdateReferralsSettingsMutation();
  const adjustCreditsMutation = useAdjustReferralsCreditsMutation();

  const [settings, setSettings] = useState<ReferralProgramSettings | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Sync settings when loaded
  useEffect(() => {
    if (settingsData) {
      setSettings(settingsData);
    }
  }, [settingsData]);

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      await updateSettingsMutation.mutateAsync(settings);
      toast.success("Referral program settings updated");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const handleAdjustCredits = async (
    userId: string,
    amount: number,
    type: "earned" | "spent" | "admin_adjustment",
    description: string
  ) => {
    await adjustCreditsMutation.mutateAsync({
      user_id: userId,
      amount,
      type,
      description,
    });
  };

  const loading =
    loadingSummary ||
    loadingSettings ||
    loadingReferrals ||
    loadingTransactions ||
    loadingUsers;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  const summary = summaryData || null;
  const referrals = referralsData?.data || [];
  const transactions = transactionsData?.data || [];
  const users = usersData?.data || [];

  return (
    <div className="space-y-6">
      {/* Summary Metrics Section */}
      <ReferralsSummaryCards summary={summary} />

      {/* Settings & Admin Adjustments Trigger */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ReferralsSettingsForm
          settings={settings}
          onChange={setSettings}
          onSave={handleSaveSettings}
          saving={updateSettingsMutation.isPending}
        />

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-lg">Administrative Override</CardTitle>
            <CardDescription>
              Manually adjust wallet balances for any store owner.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-end">
            <p className="text-xs text-muted-foreground mb-4">
              Use this override tool to award bonuses, fix accounting disputes,
              or manually handle refunds in credits.
            </p>
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              <Plus className="mr-2 h-4 w-4" /> Adjust User Balance
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Relationships Table */}
      <ReferralsRelationshipsTable referrals={referrals} />

      {/* Audit Logs Table */}
      <ReferralsAuditLog transactions={transactions} />

      {/* Adjustment Dialog Overlay */}
      <ReferralsAdjustDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        users={users}
        onAdjust={handleAdjustCredits}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { ReferralProgramSettings } from "./types";

import { ReferralsSummaryCards } from "./referrals-summary-cards";
import { ReferralsSettingsForm } from "./referrals-settings-form";
import { ReferralsRelationshipsTable } from "./referrals-relationships-table";
import { ReferralsAuditLog } from "./referrals-audit-log";
import { ReferralsAdjustDialog } from "./referrals-adjust-dialog";

import {
  useReferralsSummary,
  useReferralsSettings,
  useReferralsRelationships,
  useReferralsTransactions,
  useUpdateReferralsSettingsMutation,
  useAdjustReferralsCreditsMutation,
} from "@/lib/api/admin-hooks";

export function ReferralsManager() {
  const [referralsPage, setReferralsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);

  const {
    data: summaryData,
    isLoading: loadingSummary,
    error: summaryError,
    refetch: refetchSummary,
  } = useReferralsSummary();
  const {
    data: settingsData,
    isLoading: loadingSettings,
    error: settingsError,
    refetch: refetchSettings,
  } = useReferralsSettings();
  const {
    data: referralsData,
    isLoading: loadingReferrals,
    error: referralsError,
    refetch: refetchReferrals,
  } = useReferralsRelationships(referralsPage);
  const {
    data: transactionsData,
    isLoading: loadingTransactions,
    error: transactionsError,
    refetch: refetchTransactions,
  } = useReferralsTransactions(transactionsPage);

  const updateSettingsMutation = useUpdateReferralsSettingsMutation();
  const adjustCreditsMutation = useAdjustReferralsCreditsMutation();

  const [settings, setSettings] = useState<ReferralProgramSettings | null>(null);
  const [prevSettingsData, setPrevSettingsData] = useState<ReferralProgramSettings | null | undefined>(undefined);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Sync settings when loaded
  if (settingsData && settingsData !== prevSettingsData) {
    setPrevSettingsData(settingsData);
    setSettings(settingsData);
  }

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      await updateSettingsMutation.mutateAsync(settings);
      toast.success("Referral program settings updated");
    } catch (error) {
      // The API layer already copies the server's `message` (including a
      // 422's first validation error) onto the Error. Flattening everything
      // to "Failed to save settings" threw that detail away.
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    }
  };

  const handleAdjustCredits = async (
    userId: string,
    amount: number,
    type: "earned" | "spent" | "admin_adjustment",
    description: string
  ) => {
    return await adjustCreditsMutation.mutateAsync({
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
    loadingTransactions;

  // Any of these failing used to collapse into a page of zeroes and empty
  // tables - identical to "this program has no activity". A platform_admin
  // hitting a 403 on a super_admin-only endpoint looked exactly the same.
  const failures: { label: string; error: unknown; retry: () => void }[] = [
    { label: "Program summary", error: summaryError, retry: () => void refetchSummary() },
    { label: "Program settings", error: settingsError, retry: () => void refetchSettings() },
    { label: "Referral relationships", error: referralsError, retry: () => void refetchReferrals() },
    { label: "Credit audit log", error: transactionsError, retry: () => void refetchTransactions() },
  ].filter((f) => f.error);

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

  return (
    <div className="space-y-6">
      {failures.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-rose-700 dark:text-rose-400">
                Some referral data could not be loaded.
              </p>
              <ul className="text-sm text-rose-700/90 dark:text-rose-400/90 space-y-0.5">
                {failures.map((f) => (
                  <li key={f.label}>
                    <span className="font-semibold">{f.label}:</span>{" "}
                    {f.error instanceof Error
                      ? f.error.message
                      : "Request failed."}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
                Figures and tables below are incomplete - they are not
                necessarily zero.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => failures.forEach((f) => f.retry())}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Summary Metrics Section */}
      <ReferralsSummaryCards summary={summary} />

      {/* Settings & Admin Adjustments Trigger */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ReferralsSettingsForm
          settings={settings}
          onChange={setSettings}
          onSave={() => void handleSaveSettings()}
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
      <ReferralsRelationshipsTable
        referrals={referrals}
        meta={referralsData?.meta}
        onPageChange={setReferralsPage}
      />

      {/* Audit Logs Table */}
      <ReferralsAuditLog
        transactions={transactions}
        meta={transactionsData?.meta}
        onPageChange={setTransactionsPage}
      />

      {/* Adjustment Dialog Overlay */}
      <ReferralsAdjustDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAdjust={handleAdjustCredits}
      />
    </div>
  );
}

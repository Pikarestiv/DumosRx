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
import api from "@/lib/api/client";
import { toast } from "sonner";

import {
  ReferralSummary,
  ReferralProgramSettings,
  ReferralRelationship,
  CreditTransaction,
  UserListItem,
} from "./types";

import { ReferralsSummaryCards } from "./referrals-summary-cards";
import { ReferralsSettingsForm } from "./referrals-settings-form";
import { ReferralsRelationshipsTable } from "./referrals-relationships-table";
import { ReferralsAuditLog } from "./referrals-audit-log";
import { ReferralsAdjustDialog } from "./referrals-adjust-dialog";

export function ReferralsManager() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [settings, setSettings] = useState<ReferralProgramSettings | null>(
    null,
  );
  const [referrals, setReferrals] = useState<ReferralRelationship[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [summaryRes, settingsRes, referralsRes, txnsRes, usersRes] =
        await Promise.all([
          api.get("/admin/referrals/summary"),
          api.get("/admin/referrals/settings"),
          api.get("/admin/referrals"),
          api.get("/admin/referrals/transactions"),
          api.get("/admin/users"),
        ]);

      setSummary(summaryRes.data);
      setSettings(settingsRes.data);
      setReferrals(referralsRes.data.data || []);
      setTransactions(txnsRes.data.data || []);
      setUsers(usersRes.data.data || []);
    } catch (error) {
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      await api.put("/admin/referrals/settings", settings);
      toast.success("Referral program settings updated");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAdjustCredits = async (
    userId: string,
    amount: number,
    type: "earned" | "spent" | "admin_adjustment",
    description: string
  ) => {
    await api.post("/admin/referrals/adjust-credits", {
      user_id: userId,
      amount,
      type,
      description,
    });
    // Refresh table data and metrics
    await fetchInitialData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

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
          saving={savingSettings}
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

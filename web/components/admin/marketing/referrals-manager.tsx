"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Plus,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";
import api from "@/lib/api/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ReferralSummary {
  total_referrals: number;
  total_credits_earned: number;
  total_credits_spent: number;
  active_referrers: number;
}

interface ReferralProgramSettings {
  enabled: boolean;
  reward_percentage: number;
  reward_trigger: "first" | "recurring";
  allow_full_credit_payment: boolean;
}

interface ReferralRelationship {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  referred_by: {
    first_name: string;
    last_name: string;
    referral_code: string;
  } | null;
  store: {
    name: string;
  } | null;
}

interface CreditTransaction {
  id: string;
  type: "earned" | "spent" | "admin_adjustment";
  amount: string;
  description: string;
  created_at: string;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  referred_user: {
    first_name: string;
    last_name: string;
  } | null;
}

interface UserListItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

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

  // Adjustment form state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<
    "earned" | "spent" | "admin_adjustment"
  >("admin_adjustment");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjusting, setAdjusting] = useState(false);

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

  const handleAdjustCredits = async () => {
    if (!selectedUserId || !adjustAmount || !adjustDescription) {
      toast.error("Please fill in all adjustment fields");
      return;
    }
    setAdjusting(true);
    try {
      await api.post("/admin/referrals/adjust-credits", {
        user_id: selectedUserId,
        amount: Number(adjustAmount),
        type: adjustType,
        description: adjustDescription,
      });

      toast.success("Credits adjusted successfully!");
      setIsDialogOpen(false);

      // Reset form
      setSelectedUserId("");
      setAdjustAmount("");
      setAdjustDescription("");
      setAdjustType("admin_adjustment");

      // Refresh
      fetchInitialData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to adjust credits");
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">
              Total Referrals
            </CardTitle>
            <Users className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {summary?.total_referrals}
            </div>
            <p className="text-xs text-slate-500">
              Pharmacies registered via links
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">
              Credits Awarded
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              ₦{summary?.total_credits_earned?.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500">Total rewards distributed</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">
              Credits Redeemed
            </CardTitle>
            <ArrowDownRight className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">
              ₦{summary?.total_credits_spent?.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500">
              Credits applied to offset checkouts
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">
              Active Referrers
            </CardTitle>
            <Users className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {summary?.active_referrers}
            </div>
            <p className="text-xs text-slate-500">Owners who earned credit</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Settings & Manual Adjustments */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Settings Card */}
        <Card className="bg-slate-900/20 border-slate-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Program Configuration</CardTitle>
            <CardDescription>
              Adjust reward percentages and trigger policies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {settings && (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enabled">Enable Referral Program</Label>
                    <p className="text-xs text-muted-foreground">
                      Toggles the entire affiliate flow on/off.
                    </p>
                  </div>
                  <Switch
                    id="enabled"
                    checked={settings.enabled}
                    onCheckedChange={(v) =>
                      setSettings({ ...settings, enabled: v })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reward">Reward Percentage (%)</Label>
                    <Input
                      id="reward"
                      type="number"
                      min={0}
                      max={100}
                      value={settings.reward_percentage}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          reward_percentage: Number(e.target.value),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Percent of transaction paid out.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="trigger">Reward Trigger Policy</Label>
                    <Select
                      value={settings.reward_trigger}
                      onValueChange={(v: "first" | "recurring") =>
                        setSettings({ ...settings, reward_trigger: v })
                      }
                    >
                      <SelectTrigger id="trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first">First Payout Only</SelectItem>
                        <SelectItem value="recurring">
                          Recurring (Every Subscription Payment)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      When rewards are triggered.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="full_payment">
                      Allow 100% Credit Checkouts
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Let users completely pay for a plan using credits.
                    </p>
                  </div>
                  <Switch
                    id="full_payment"
                    checked={settings.allow_full_credit_payment}
                    onCheckedChange={(v) =>
                      setSettings({ ...settings, allow_full_credit_payment: v })
                    }
                  />
                </div>
              </>
            )}
            <Button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full"
            >
              {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>

        {/* Override Payout Card */}
        <Card className="bg-slate-900/20 border-slate-800 flex flex-col justify-between">
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
            <Button onClick={() => setIsDialogOpen(true)} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Adjust User Balance
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Referrals & Transactions Tabs */}
      <Card className="bg-slate-900/20 border-slate-800">
        <CardHeader>
          <CardTitle>Referral Relationships</CardTitle>
          <CardDescription>
            All stores registered using user referral links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-900/40">
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-300">
                    Referred Pharmacy
                  </TableHead>
                  <TableHead className="text-slate-300">
                    Referred User
                  </TableHead>
                  <TableHead className="text-slate-300">Referrer</TableHead>
                  <TableHead className="text-slate-300">
                    Referral Code
                  </TableHead>
                  <TableHead className="text-slate-300">
                    Date Registered
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((ref) => (
                  <TableRow
                    key={ref.id}
                    className="border-slate-800 hover:bg-slate-900/10"
                  >
                    <TableCell className="font-semibold text-slate-200">
                      {ref.store ? ref.store.name : "N/A"}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {ref.first_name} {ref.last_name} <br />
                      <span className="text-xs font-mono text-slate-500">
                        {ref.email}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {ref.referred_by
                        ? `${ref.referred_by.first_name} ${ref.referred_by.last_name}`
                        : "N/A"}
                    </TableCell>
                    <TableCell className="font-mono text-indigo-400">
                      {ref.referred_by ? ref.referred_by.referral_code : "-"}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {format(new Date(ref.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
                {referrals.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground border-slate-800"
                    >
                      No referral registrations tracked yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Credit Transactions Audit Log */}
      <Card className="bg-slate-900/20 border-slate-800">
        <CardHeader>
          <CardTitle>Credit Audit Log</CardTitle>
          <CardDescription>
            Detailed transactional history of all earned, spent, and adjusted
            credits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md border-slate-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-900/40">
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-300">Date</TableHead>
                  <TableHead className="text-slate-300">User Wallet</TableHead>
                  <TableHead className="text-slate-300">Type</TableHead>
                  <TableHead className="text-slate-300">Amount</TableHead>
                  <TableHead className="text-slate-300">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow
                    key={txn.id}
                    className="border-slate-800 hover:bg-slate-900/10"
                  >
                    <TableCell className="text-slate-400 text-xs font-mono">
                      {format(new Date(txn.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {txn.user
                        ? `${txn.user.first_name} ${txn.user.last_name}`
                        : "System"}{" "}
                      <br />
                      <span className="text-xs font-mono text-slate-500">
                        {txn.user?.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          txn.type === "earned"
                            ? "default"
                            : txn.type === "spent"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {txn.type === "earned"
                          ? "Earned"
                          : txn.type === "spent"
                            ? "Redeemed"
                            : "Adjustment"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`font-bold ${txn.type === "earned" ? "text-green-500" : "text-rose-500"}`}
                    >
                      {txn.type === "earned" ? "+" : "-"}₦
                      {Number(txn.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {txn.description}
                    </TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground border-slate-800"
                    >
                      No credit transactions recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Credit Adjustment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manually Adjust Credits</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="user">Target User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger
                  id="user"
                  className="bg-slate-900 border-slate-800"
                >
                  <SelectValue placeholder="Select user to adjust" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Adjustment Type</Label>
              <Select
                value={adjustType}
                onValueChange={(v: any) => setAdjustType(v)}
              >
                <SelectTrigger
                  id="type"
                  className="bg-slate-900 border-slate-800"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                  <SelectItem value="earned">
                    Credit / Award Wallet (Earned)
                  </SelectItem>
                  <SelectItem value="spent">
                    Deduct / Charge Wallet (Spent)
                  </SelectItem>
                  <SelectItem value="admin_adjustment">
                    Discretionary Correction (Adjustment)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                placeholder="e.g. 5000"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="bg-slate-900 border-slate-800"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="desc">Reason / Description</Label>
              <Input
                id="desc"
                placeholder="e.g. Compensation for payment gateway delay"
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
                className="bg-slate-900 border-slate-800"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-slate-800 hover:bg-slate-900"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAdjustCredits} disabled={adjusting}>
              {adjusting ? "Processing..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

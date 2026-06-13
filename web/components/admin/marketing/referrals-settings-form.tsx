"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReferralProgramSettings } from "./types";

interface ReferralsSettingsFormProps {
  settings: ReferralProgramSettings | null;
  onChange: (settings: ReferralProgramSettings) => void;
  onSave: () => void;
  saving: boolean;
}

export function ReferralsSettingsForm({
  settings,
  onChange,
  onSave,
  saving,
}: ReferralsSettingsFormProps) {
  if (!settings) return null;

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 md:col-span-2 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Program Configuration</CardTitle>
        <CardDescription>
          Adjust reward percentages and trigger policies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="enabled"
              className="font-bold text-slate-800 dark:text-slate-200"
            >
              Enable Referral Program
            </Label>
            <p className="text-xs text-muted-foreground">
              Toggles the entire affiliate flow on/off.
            </p>
          </div>
          <Switch
            id="enabled"
            checked={settings.enabled}
            onCheckedChange={(v) => onChange({ ...settings, enabled: v })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="reward"
              className="font-bold text-slate-800 dark:text-slate-200"
            >
              Reward Percentage (%)
            </Label>
            <Input
              id="reward"
              type="number"
              min={0}
              max={100}
              value={settings.reward_percentage}
              onChange={(e) =>
                onChange({
                  ...settings,
                  reward_percentage: Number(e.target.value),
                })
              }
              className="border-slate-200 dark:border-slate-800"
            />
            <p className="text-xs text-muted-foreground">
              Percent of transaction paid out.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="trigger"
              className="font-bold text-slate-800 dark:text-slate-200"
            >
              Reward Trigger Policy
            </Label>
            <Select
              value={settings.reward_trigger}
              onValueChange={(v: "first" | "recurring") =>
                onChange({ ...settings, reward_trigger: v })
              }
            >
              <SelectTrigger
                id="trigger"
                className="border-slate-200 dark:border-slate-800"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">First Payout Only</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When rewards are triggered.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="full_payment"
              className="font-bold text-slate-800 dark:text-slate-200"
            >
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
              onChange({ ...settings, allow_full_credit_payment: v })
            }
          />
        </div>

        <Button
          onClick={onSave}
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

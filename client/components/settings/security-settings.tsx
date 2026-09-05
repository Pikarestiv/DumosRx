"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";

// Single source of truth for both the dropdown's options and the
// self-heal check below, so they can't drift out of sync with each other.
const AUTO_LOCK_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 1, label: "1 Minute" },
  { value: 5, label: "5 Minutes" },
  { value: 15, label: "15 Minutes" },
  { value: 30, label: "30 Minutes" },
] as const;

interface SecuritySettingsProps {
  currentPin: string;
  setCurrentPin: (val: string) => void;
  newPin: string;
  setNewPin: (val: string) => void;
  confirmPin: string;
  setConfirmPin: (val: string) => void;
  handleUpdateSecurity: () => Promise<boolean | void> | void;
}

export function SecuritySettings({
  currentPin,
  setCurrentPin,
  newPin,
  setNewPin,
  confirmPin,
  setConfirmPin,
  handleUpdateSecurity,
}: SecuritySettingsProps) {
  const [isEditingPin, setIsEditingPin] = useState(false);
  const duration = useAutoLockStore((s) => s.duration);
  const setDuration = useAutoLockStore((s) => s.setDuration);
  const { canAutoLock, withRestriction, getUpgradeMessage } = useFeatureGate();

  // Self-heals a persisted duration that doesn't match any current option
  // (an older app version's value, manual/corrupted localStorage, a future
  // option removed) — Radix's Select has nothing to match and renders
  // completely blank in that case, not even its own placeholder, with no
  // way for the user to tell why or fix it themselves short of picking a
  // new value. Falls back to the store's own documented default (5).
  useEffect(() => {
    if (!AUTO_LOCK_OPTIONS.some((opt) => opt.value === duration)) {
      setDuration(5);
    }
  }, [duration, setDuration]);

  const onSubmit = async () => {
    const success = await handleUpdateSecurity();
    if (success) {
      setIsEditingPin(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Settings</CardTitle>
        <CardDescription>Protect your account and session.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!!!isEditingPin && (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Login PIN</Label>
              <p className="text-sm text-muted-foreground">
                Your 4-digit PIN used to unlock the POS and dashboard
              </p>
            </div>
            <Button variant="outline" onClick={() => setIsEditingPin(true)}>
              Change PIN
            </Button>
          </div>
        )}
        {!!isEditingPin && (
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Update Login PIN</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingPin(false)}
              >
                Cancel
              </Button>
            </div>
            <div className="grid gap-2">
              <Label>Current PIN</Label>
              <Input
                type="password"
                maxLength={4}
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>New PIN</Label>
              <Input
                type="password"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Confirm New PIN</Label>
              <Input
                type="password"
                maxLength={4}
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
            <div className="pt-2">
              <Button onClick={onSubmit} className="w-full">
                Save New PIN
              </Button>
            </div>
          </div>
        )}
        <Separator className="my-4" />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base flex items-center gap-1.5">
              Auto-Lock Screen
              {!canAutoLock && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Label>
            <p className="text-sm text-muted-foreground">
              {canAutoLock
                ? "Lock dashboard after a period of inactivity"
                : getUpgradeMessage(
                    "auto_lock",
                    "Auto-lock requires a plan upgrade.",
                  )}
            </p>
          </div>
          <Select
            value={duration.toString()}
            onValueChange={withRestriction(
              (val: string) => setDuration(Number(val)),
              { featureAllowed: canAutoLock, featureKey: "auto_lock" },
            )}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              {AUTO_LOCK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

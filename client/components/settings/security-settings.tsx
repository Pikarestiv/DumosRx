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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

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
        {!isEditingPin ? (
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
        ) : (
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
            <Label className="text-base">Auto-Lock Screen</Label>
            <p className="text-sm text-muted-foreground">
              Lock dashboard after 5 minutes of inactivity
            </p>
          </div>
          <Switch />
        </div>
      </CardContent>
    </Card>
  );
}

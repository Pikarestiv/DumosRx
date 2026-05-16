"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface SecuritySettingsProps {
  currentPin: string;
  setCurrentPin: (val: string) => void;
  newPin: string;
  setNewPin: (val: string) => void;
  confirmPin: string;
  setConfirmPin: (val: string) => void;
  handleUpdateSecurity: () => void;
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Settings</CardTitle>
        <CardDescription>
          Protect your account and session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Current PIN</Label>
          <Input
            type="password"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>New PIN</Label>
          <Input
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>Confirm New PIN</Label>
          <Input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
          />
        </div>
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
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleUpdateSecurity}>
          Update Security
        </Button>
      </CardFooter>
    </Card>
  );
}

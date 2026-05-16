"use client";

import { Save } from "lucide-react";
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

interface AlertSettingsProps {
  lowStockAlert: boolean;
  setLowStockAlert: (val: boolean) => void;
  expiryAlert: boolean;
  setExpiryAlert: (val: boolean) => void;
  expiryDays: string;
  setExpiryDays: (val: string) => void;
  handleSaveAlertSettings: () => void;
}

export function AlertSettings({
  lowStockAlert,
  setLowStockAlert,
  expiryAlert,
  setExpiryAlert,
  expiryDays,
  setExpiryDays,
  handleSaveAlertSettings,
}: AlertSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Alerts</CardTitle>
        <CardDescription>
          Configure when you want to be warned about stock issues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Low Stock Warning</Label>
            <p className="text-sm text-muted-foreground">
              Notify when stock hits reorder level
            </p>
          </div>
          <Switch
            checked={lowStockAlert}
            onCheckedChange={setLowStockAlert}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Expiry Warning</Label>
            <p className="text-sm text-muted-foreground">
              Notify before medicines expire
            </p>
          </div>
          <Switch
            checked={expiryAlert}
            onCheckedChange={setExpiryAlert}
          />
        </div>
        <div className="grid gap-2 pt-4">
          <Label>Days before expiry to warn</Label>
          <Input
            type="number"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="max-w-[150px]"
          />
        </div>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button
          onClick={handleSaveAlertSettings}
          className="cursor-pointer"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Alert Preferences
        </Button>
      </CardFooter>
    </Card>
  );
}

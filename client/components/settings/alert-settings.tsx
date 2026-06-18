"use client";

import { Save, Info } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
            <div className="flex items-center gap-2">
              <Label className="text-base">Low Stock Warning</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Triggers an alert when a product's stock level falls below its configured minimum threshold.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
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
            <div className="flex items-center gap-2">
              <Label className="text-base">Expiry Warning</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Triggers an alert when a medication batch is approaching its expiration date based on the days set below.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
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

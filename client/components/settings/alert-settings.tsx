"use client";

import { useState } from "react";
import { Save, Info, Pencil, X } from "lucide-react";
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
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Stock Batch Alerts</CardTitle>
          <CardDescription>
            Configure when you want to be warned about stock issues.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(!isEditing)}
        >
          {!!(isEditing) && <X className="h-4 w-4" />}
                  {!(isEditing) && <Pencil className="h-4 w-4" />}
        </Button>
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
          {!!(isEditing) && (
                              <Switch
                                checked={lowStockAlert}
                                onCheckedChange={setLowStockAlert}
                              />
                            )}
                  {!(isEditing) && (
                              <p className="text-sm font-medium">{!!(lowStockAlert) && "Enabled"}
                      {!(lowStockAlert) && "Disabled"}</p>
                            )}
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
              Notify before products expire
            </p>
          </div>
          {!!(isEditing) && (
                              <Switch
                                checked={expiryAlert}
                                onCheckedChange={setExpiryAlert}
                              />
                            )}
                  {!(isEditing) && (
                              <p className="text-sm font-medium">{!!(expiryAlert) && "Enabled"}
                      {!(expiryAlert) && "Disabled"}</p>
                            )}
        </div>
        <div className="grid gap-2 pt-4">
          <Label>Days before expiry to warn</Label>
          {!!(isEditing) && (
                              <Input
                                type="number"
                                value={expiryDays}
                                onChange={(e) => setExpiryDays(e.target.value)}
                                className="max-w-[150px]"
                              />
                            )}
                  {!(isEditing) && (
                              <p className="text-sm font-medium py-2">{expiryDays || "Not set"} days</p>
                            )}
        </div>
      </CardContent>
      {isEditing && (
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={() => {
              handleSaveAlertSettings();
              setIsEditing(false);
            }}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Alert Preferences
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

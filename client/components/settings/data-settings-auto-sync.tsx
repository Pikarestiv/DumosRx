import { useState } from "react";
import { HelpCircle, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DataSettingsAutoSyncProps {
  canCloudSync: boolean;
  minimumSyncIntervalMinutes: number;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (val: boolean) => void;
  autoSyncInterval: string;
  setAutoSyncInterval: (val: string) => void;
  handleSaveAutoSyncSettings: () => void;
}

const INTERVAL_LABELS: Record<string, string> = {
  "0": "Sync Instantly",
  "5": "Every 5 Minutes",
  "15": "Every 15 Minutes",
  "30": "Every 30 Minutes",
  "60": "Every 1 Hour",
  "360": "Every 6 Hours",
};

export function DataSettingsAutoSync({
  canCloudSync,
  minimumSyncIntervalMinutes,
  autoSyncEnabled,
  setAutoSyncEnabled,
  autoSyncInterval,
  setAutoSyncInterval,
  handleSaveAutoSyncSettings,
}: DataSettingsAutoSyncProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div
      className={`space-y-4 ${!canCloudSync ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Background Automation</h3>
          {!canCloudSync && <Badge variant="outline">Pro Feature</Badge>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <X className="h-4 w-4" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="space-y-4 border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label className="text-base">Auto-Sync Changes</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Automatically pushes your local sales and data to the
                      cloud, and pulls any new changes made by other devices.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatically push and pull data when online.
            </p>
          </div>
          {isEditing ? (
            <Switch
              checked={autoSyncEnabled}
              onCheckedChange={setAutoSyncEnabled}
            />
          ) : (
            <p className="text-sm font-medium">
              {autoSyncEnabled ? "Enabled" : "Disabled"}
            </p>
          )}
        </div>
        {autoSyncEnabled && (
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Label>Sync Interval</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      How often the app should sync data with the cloud in
                      the background. "Sync Instantly" pushes changes as
                      soon as they happen, if your plan allows it.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {isEditing ? (
              <Select
                value={autoSyncInterval}
                onValueChange={setAutoSyncInterval}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  {minimumSyncIntervalMinutes <= 0 && (
                    <SelectItem value="0">Sync Instantly</SelectItem>
                  )}
                  {minimumSyncIntervalMinutes <= 5 && (
                    <SelectItem value="5">Every 5 Minutes</SelectItem>
                  )}
                  {minimumSyncIntervalMinutes <= 15 && (
                    <SelectItem value="15">Every 15 Minutes</SelectItem>
                  )}
                  {minimumSyncIntervalMinutes <= 30 && (
                    <SelectItem value="30">Every 30 Minutes</SelectItem>
                  )}
                  {minimumSyncIntervalMinutes <= 60 && (
                    <SelectItem value="60">Every 1 Hour</SelectItem>
                  )}
                  <SelectItem value="360">Every 6 Hours</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm font-medium">
                {INTERVAL_LABELS[autoSyncInterval] || `Every ${autoSyncInterval} Minutes`}
              </p>
            )}
          </div>
        )}
        {isEditing && (
          <div className="pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                handleSaveAutoSyncSettings();
                setIsEditing(false);
              }}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Auto-Sync Settings
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

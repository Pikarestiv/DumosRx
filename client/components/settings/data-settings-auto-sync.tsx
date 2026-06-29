import { Info, Save } from "lucide-react";
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
  isCloudLinked: boolean;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (val: boolean) => void;
  autoSyncInterval: string;
  setAutoSyncInterval: (val: string) => void;
  handleSaveAutoSyncSettings: () => void;
}

export function DataSettingsAutoSync({
  canCloudSync,
  minimumSyncIntervalMinutes,
  isCloudLinked,
  autoSyncEnabled,
  setAutoSyncEnabled,
  autoSyncInterval,
  setAutoSyncInterval,
  handleSaveAutoSyncSettings,
}: DataSettingsAutoSyncProps) {
  return (
    <div
      className={`space-y-4 ${!canCloudSync ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Background Automation</h3>
        {!canCloudSync && <Badge variant="outline">Pro Feature</Badge>}
      </div>
      <div className="space-y-4 border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label className="text-base">Auto-Sync Changes</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Automatically pushes your local sales and data to the cloud,
                      and pulls any new changes made by other devices.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatically push and pull data when online.
            </p>
          </div>
          <Switch
            checked={autoSyncEnabled}
            onCheckedChange={setAutoSyncEnabled}
            disabled={!isCloudLinked}
          />
        </div>
        {autoSyncEnabled && (
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Label>Sync Interval</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      How often (in minutes) the app should attempt to sync data
                      with the cloud in the background.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={autoSyncInterval}
              onValueChange={setAutoSyncInterval}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
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
          </div>
        )}
        <div className="pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSaveAutoSyncSettings}
            disabled={!isCloudLinked}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Auto-Sync Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

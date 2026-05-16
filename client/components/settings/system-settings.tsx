"use client";

import { RefreshCw, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { isTauri } from "@/lib/db/core";

interface SystemSettingsProps {
  handleCheckForUpdates: () => void;
  isCheckingUpdate: boolean;
  isUpdating: boolean;
  updateAvailable: any;
  handleInstallUpdate: () => void;
}

export function SystemSettings({
  handleCheckForUpdates,
  isCheckingUpdate,
  isUpdating,
  updateAvailable,
  handleInstallUpdate,
}: SystemSettingsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Updates</CardTitle>
          <CardDescription>
            Manage application updates and system information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Application Version</Label>
              <p className="text-sm text-muted-foreground">
                Current version: {APP_VERSION}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate || isUpdating}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isCheckingUpdate ? "animate-spin" : ""}`}
              />
              {isCheckingUpdate ? "Checking..." : "Check for Updates"}
            </Button>
          </div>

          {updateAvailable && (
            <div className="p-4 border rounded-lg bg-primary/5 border-primary/20 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-primary/10 text-primary">
                  <Info className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-primary">
                    New Update Available!
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Version {updateAvailable.version} is now available.
                    This update includes new features and bug fixes.
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleInstallUpdate}
                disabled={isUpdating}
              >
                <Download className="w-4 h-4 mr-2" />
                {isUpdating
                  ? "Installing..."
                  : `Install Version ${updateAvailable.version}`}
              </Button>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label>System Information</Label>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Environment</p>
                <p className="font-medium">
                  {isTauri() ? "Desktop (Tauri)" : "Web Browser"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Platform</p>
                <p className="font-medium">
                  {typeof window !== "undefined"
                    ? navigator.userAgent.includes("Mac")
                      ? "MacOS"
                      : navigator.userAgent.includes("Win")
                        ? "Windows"
                        : "Linux"
                    : "Unknown"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About {APP_NAME}</CardTitle>
          <CardDescription>
            Software information and licensing
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            DumosRx is a professional pharmacy management system
            designed to streamline operations, track inventory, and
            manage sales with ease.
          </p>
          <p className="mt-4">
            © 2019 - {new Date().getFullYear()} {APP_NAME}. All rights
            reserved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

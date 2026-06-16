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
}

export function SystemSettings({
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
          <div className="space-y-0.5">
            <Label>Application Version</Label>
            <p className="text-sm text-muted-foreground">
              Current version: {APP_VERSION}
            </p>
          </div>

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
            DumosRx is a professional retail and store management system
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

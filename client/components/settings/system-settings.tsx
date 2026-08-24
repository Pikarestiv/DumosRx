"use client";

import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { APP_NAME, APP_VERSION, SUPPORT_EMAIL, WEB_APP_URL } from "@/lib/constants";
import { isTauri } from "@/lib/db/core";
import { IosInstallCard } from "./ios-install-card";
import { AndroidInstallCard } from "./android-install-card";
import { DownloadAppsCard } from "./download-apps-card";

export function SystemSettings() {
  return (
    <div className="space-y-6">
      <IosInstallCard />
      <AndroidInstallCard />
      {!isTauri() && <DownloadAppsCard />}

      <Card>
        <CardHeader>
          <CardTitle>Web Dashboard</CardTitle>
          <CardDescription>
            Manage your subscription, view all your stores in one place, and
            oversee staff from your account dashboard in the cloud
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer">
              Open Web Dashboard
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>

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
          <CardDescription>Software information and licensing</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            DumosRx is a professional retail and store management system
            designed to streamline operations, track inventory, and manage sales
            with ease.
          </p>
          <p className="mt-4">
            Need help? Reach us at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-4">
            © 2019 - {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

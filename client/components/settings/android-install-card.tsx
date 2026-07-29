"use client";

import { Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/hooks/use-install-prompt";
import { isTauri } from "@/lib/db/core";

/** Nudges Android/Chrome users to install the PWA even though a native APK
 * also exists — the PWA install is one tap, doesn't require enabling
 * "install from unknown sources", and stays current automatically. Only
 * renders once Chrome has judged the site installable and fired
 * beforeinstallprompt; hidden entirely in the Tauri-wrapped desktop/native
 * build, which doesn't need it. */
export function AndroidInstallCard() {
  const { canInstall, promptInstall } = useInstallPrompt();

  if (isTauri() || !canInstall) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install App</CardTitle>
        <CardDescription>
          Install DumosRx as an app for faster access and a full-screen
          experience — no browser tabs, no APK download or "unknown sources"
          setting required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={promptInstall}>
          <Download className="h-4 w-4" />
          Install App
        </Button>
      </CardContent>
    </Card>
  );
}

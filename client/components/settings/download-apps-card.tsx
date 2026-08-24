"use client";

import { Monitor, Laptop, Globe, Smartphone, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLatestRelease } from "@/lib/hooks/use-latest-release";

const PLATFORMS = [
  { os: "Windows", icon: Monitor, key: "windows" as const },
  { os: "macOS", icon: Laptop, key: "macos" as const },
  { os: "Linux", icon: Globe, key: "linux" as const },
  { os: "Android (APK)", icon: Smartphone, key: "android" as const },
];

/** Lets a store owner grab a native build for another device — paired with
 * the PWA install cards above, which cover this device instead. The Android
 * APK here is a fallback for devices/browsers where the PWA install prompt
 * (AndroidInstallCard) isn't available. */
export function DownloadAppsCard() {
  const { data: release, isLoading } = useLatestRelease();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get DumosRx on Other Devices</CardTitle>
        <CardDescription>
          Download DumosRx for another computer or phone
          {release?.version ? ` (version ${release.version})` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {PLATFORMS.map(({ os, icon: Icon, key }) => (
          <Button
            key={os}
            asChild={!isLoading}
            variant="outline"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {os}
              </span>
            ) : (
              <a
                href={release?.[key]}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon className="h-4 w-4" />
                {os}
              </a>
            )}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

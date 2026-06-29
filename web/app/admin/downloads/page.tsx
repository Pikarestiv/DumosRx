"use client";

import { useLatestRelease } from "@/lib/api/release-hooks";
import { APP_VERSION } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Globe, Smartphone, Download, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AdminDownloadsPage() {
  const { data: links, isLoading } = useLatestRelease();

  const defaultLinks = {
    windows: `https://downloads.dumosrx.com`,
    macos: `https://downloads.dumosrx.com`,
    linux: `https://downloads.dumosrx.com`,
    android: `https://downloads.dumosrx.com`,
    version: APP_VERSION,
    winSize: "---",
    macSize: "---",
    linuxSize: "---",
    androidSize: "---",
  };

  const currentLinks = links || defaultLinks;
  const linuxAssetExists = !!currentLinks.linux;
  const androidAssetExists = !!currentLinks.android;

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            System Downloads
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Direct access to the latest DumosRx binaries for testing and manual distribution.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold leading-5 text-indigo-600 bg-indigo-500/10 border border-indigo-500/20">
          Latest Release: {currentLinks.version}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Windows Card */}
        <Card className="relative overflow-hidden border-2 hover:border-indigo-500/50 transition-colors group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Monitor className="w-24 h-24" />
          </div>
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-indigo-500" />
              Windows
            </CardTitle>
            <CardDescription className="flex flex-col gap-1 mt-1">
              <span className="font-semibold text-foreground">
                {currentLinks.winSize}
              </span>
              <span>.msi Installer</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Direct Link
              </div>
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold"
                asChild
              >
                <a href={currentLinks.windows} target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* macOS Card */}
        <Card className="relative overflow-hidden border-2 hover:border-indigo-500/50 transition-colors group dark:bg-slate-900 dark:border-slate-800">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Monitor className="w-24 h-24" />
          </div>
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-indigo-500" />
              macOS
            </CardTitle>
            <CardDescription className="flex flex-col gap-1 mt-1">
              <span className="font-semibold text-foreground">
                {currentLinks.macSize}
              </span>
              <span>.dmg Image</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Direct Link
              </div>
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold"
                asChild
              >
                <a href={currentLinks.macos} target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Linux Card */}
        <Card
          className={cn(
            "relative overflow-hidden border-2 transition-colors group dark:bg-slate-900 dark:border-slate-800",
            !linuxAssetExists ? "opacity-80 border-dashed" : "hover:border-indigo-500/50",
          )}
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Globe className="w-24 h-24" />
          </div>
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-500" />
              Linux
            </CardTitle>
            <CardDescription className="flex flex-col gap-1 mt-1">
              {linuxAssetExists ? (
                <>
                  <span className="font-semibold text-foreground">
                    {currentLinks.linuxSize}
                  </span>
                  <span>AppImage</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-amber-500">Coming Soon</span>
                  <span>AppImage</span>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck
                  className={cn(
                    "w-4 h-4",
                    linuxAssetExists ? "text-emerald-500" : "text-slate-500",
                  )}
                />
                Direct Link
              </div>
              {linuxAssetExists ? (
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold"
                  asChild
                >
                  <a href={currentLinks.linux} target="_blank" rel="noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
              ) : (
                <Button variant="outline" className="w-full font-bold" disabled>
                  Unavailable
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Android Card */}
        <Card
          className={cn(
            "relative overflow-hidden border-2 transition-colors group dark:bg-slate-900 dark:border-slate-800",
            !androidAssetExists ? "opacity-80 border-dashed" : "hover:border-indigo-500/50",
          )}
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Smartphone className="w-24 h-24" />
          </div>
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-500" />
              Android
            </CardTitle>
            <CardDescription className="flex flex-col gap-1 mt-1">
              {androidAssetExists ? (
                <>
                  <span className="font-semibold text-foreground">
                    {currentLinks.androidSize}
                  </span>
                  <span>.apk Installer</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-amber-500">Coming Soon</span>
                  <span>.apk Installer</span>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck
                  className={cn(
                    "w-4 h-4",
                    androidAssetExists ? "text-emerald-500" : "text-slate-500",
                  )}
                />
                Direct Link
              </div>
              {androidAssetExists ? (
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold"
                  asChild
                >
                  <a href={currentLinks.android} target="_blank" rel="noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
              ) : (
                <Button variant="outline" className="w-full font-bold" disabled>
                  Unavailable
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

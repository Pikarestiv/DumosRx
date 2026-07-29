"use client";

import { useState } from "react";
import {
  Smartphone,
  Monitor,
  Globe,
  Download,
  ArrowRight,
  Laptop,
  Apple,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DOWNLOAD_URL } from "@/lib/constants";
import { IosInstallDialog } from "./ios-install-dialog";

interface DownloadsViewProps {
  releaseLinks: any;
  requiresVerification?: boolean;
}

export function DownloadsView({
  releaseLinks,
  requiresVerification,
}: DownloadsViewProps) {
  const [iosDialogOpen, setIosDialogOpen] = useState(false);

  if (!releaseLinks || !releaseLinks.version) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-muted/60 rounded-full flex items-center justify-center mb-6">
          <Download className="h-10 w-10 text-muted-foreground opacity-50" />
        </div>
        <h2 className="text-2xl font-bold mb-3">No Releases Available Yet</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          No release files available yet. Please check back later!
        </p>
      </div>
    );
  }
  const primaryApps = [
    {
      os: "Windows",
      description: "For Windows 10/11",
      icon: Monitor,
      version: releaseLinks.version,
      size: releaseLinks.winSize,
      link: releaseLinks.windows,
      gradient: "from-blue-500/20 to-cyan-500/5",
      border: "hover:border-blue-500/50",
      iconColor: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      os: "macOS",
      description: "For Apple Silicon & Intel",
      icon: Laptop,
      version: releaseLinks.version,
      size: releaseLinks.macSize,
      link: releaseLinks.macos,
      gradient: "from-purple-500/20 to-pink-500/5",
      border: "hover:border-purple-500/50",
      iconColor: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  const secondaryApps = [
    {
      os: "Linux",
      description: "AppImage (x86_64)",
      icon: Globe,
      version: releaseLinks.version,
      size: releaseLinks.linuxSize,
      link: releaseLinks.linux,
    },
    {
      os: "Android",
      description: "APK for Android 8.0+",
      icon: Smartphone,
      version: releaseLinks.version,
      size: releaseLinks.androidSize,
      link: releaseLinks.android,
    },
  ];

  const formatVersion = (v: string) => (v?.startsWith("v") ? v : `v${v}`);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      <div className="text-center max-w-2xl mx-auto space-y-4 pt-8">
        <div className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-full mb-2">
          <Download className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">
          Get DumosRx Local
        </h1>
        <p className="text-lg text-muted-foreground">
          Download the ultra-fast offline client for your store devices. Enjoy
          seamless background sync and unmatched performance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        {primaryApps.map((app, i) => (
          <Card
            key={i}
            className={`overflow-hidden border-2 border-transparent bg-background/60 backdrop-blur-xl shadow-lg transition-all duration-300 ${app.border} relative group`}
          >
            <div
              className={`absolute inset-0 bg-linear-to-br ${app.gradient} opacity-50 group-hover:opacity-100 transition-opacity`}
            />
            <CardContent className="p-8 relative z-10 flex flex-col h-full">
              <div className="flex justify-between items-start mb-8">
                <div
                  className={`w-16 h-16 ${app.bg} rounded-2xl flex items-center justify-center ${app.iconColor} shadow-inner`}
                >
                  <app.icon className="h-8 w-8" />
                </div>
                {!app.link && (
                  <Badge
                    variant="secondary"
                    className="bg-amber-100 text-amber-700 border-amber-200"
                  >
                    Coming Soon
                  </Badge>
                )}
              </div>

              <div className="mt-auto">
                <h3 className="text-3xl font-black mb-1">{app.os}</h3>
                <p className="text-muted-foreground font-medium mb-6">
                  {app.description}
                </p>

                <div className="flex items-center justify-between mb-8 text-sm font-medium bg-muted/50 p-3 rounded-xl">
                  <span className="text-foreground/80">
                    Version {formatVersion(app.version)}
                  </span>
                  <span className="text-muted-foreground">{app.size}</span>
                </div>

                <Button
                  size="lg"
                  className="w-full font-bold h-14 text-lg shadow-xl"
                  variant={
                    app.link && !requiresVerification ? "default" : "secondary"
                  }
                  disabled={!app.link || requiresVerification}
                  asChild={!!app.link && !requiresVerification}
                >
                  {app.link ? (
                    requiresVerification ? (
                      <span>Verify Email to Download</span>
                    ) : (
                      <a
                        href={app.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download for {app.os}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    )
                  ) : (
                    <span>Unavailable</span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-dashed border-border/50">
        {secondaryApps.map((app, i) => (
          <div
            key={i}
            className="flex items-center p-6 bg-muted/60 rounded-3xl border border-transparent hover:border-border transition-colors"
          >
            <div className="w-12 h-12 bg-background rounded-xl flex items-center justify-center text-foreground shadow-sm mr-5">
              <app.icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-bold">{app.os}</h4>
              <p className="text-sm text-muted-foreground">{app.description}</p>
            </div>
            <div className="text-right mr-5 hidden sm:block">
              <p className="text-sm font-medium">
                {formatVersion(app.version)}
              </p>
              <p className="text-xs text-muted-foreground">{app.size}</p>
            </div>
            <Button
              variant={app.link && !requiresVerification ? "outline" : "ghost"}
              className="font-bold rounded-full px-6"
              disabled={!app.link || requiresVerification}
              asChild={!!app.link && !requiresVerification}
            >
              {app.link ? (
                requiresVerification ? (
                  <span>Verify</span>
                ) : (
                  <a href={app.link} target="_blank" rel="noopener noreferrer">
                    Get
                  </a>
                )
              ) : (
                <span>Wait</span>
              )}
            </Button>
          </div>
        ))}

        {/* iOS has no downloadable file — Safari only lets users add the
            dashboard to the Home Screen via its Share sheet, so this opens
            instructions instead of linking to anything. */}
        <div className="flex items-center p-6 bg-muted/60 rounded-3xl border border-transparent hover:border-border transition-colors">
          <div className="w-12 h-12 bg-background rounded-xl flex items-center justify-center text-foreground shadow-sm mr-5">
            <Apple className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-bold">iOS</h4>
            <p className="text-sm text-muted-foreground">
              Add to Home Screen (iPhone/iPad)
            </p>
          </div>
          <Button
            variant="outline"
            className="font-bold rounded-full px-6"
            disabled={requiresVerification}
            onClick={() => setIosDialogOpen(true)}
          >
            {requiresVerification ? "Verify" : "Instructions"}
          </Button>
        </div>
      </div>

      <IosInstallDialog open={iosDialogOpen} onOpenChange={setIosDialogOpen} />

      <div className="bg-linear-to-r from-muted/60 to-muted/40 border border-muted rounded-[2rem] p-10 text-center max-w-3xl mx-auto mt-16 backdrop-blur-sm">
        <h3 className="text-xl font-black mb-3 text-foreground">
          Need a different version?
        </h3>
        <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
          Access all historical versions, beta releases, and view the changelog
          on our official download center.
        </p>
        <Button
          variant="default"
          className="font-bold rounded-full px-8 h-12 shadow-md"
          disabled={requiresVerification}
          asChild={!requiresVerification}
        >
          {requiresVerification ? (
            <span>Verify Email to Browse</span>
          ) : (
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse All Releases
            </a>
          )}
        </Button>
      </div>
    </div>
  );
}

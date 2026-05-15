"use client";

import { Smartphone, Activity, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DownloadsViewProps {
  releaseLinks: any;
}

export function DownloadsView({ releaseLinks }: DownloadsViewProps) {
  const downloadCards = [
    {
      os: "Windows",
      icon: Smartphone,
      version: releaseLinks.version,
      size: releaseLinks.winSize,
      link: releaseLinks.windows,
    },
    {
      os: "macOS",
      icon: Activity,
      version: releaseLinks.version,
      size: releaseLinks.macSize,
      link: releaseLinks.macos,
    },
    {
      os: "Linux",
      icon: Globe,
      version: releaseLinks.version + " (AppImage)",
      size: releaseLinks.linuxSize,
      link: releaseLinks.linux,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight">App Downloads</h1>
        <p className="text-muted-foreground">Download the DumosRx Local Client for your pharmacy computers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {downloadCards.map((app, i) => (
          <Card key={i} className="border-none shadow-sm hover:border-primary/50 transition-colors border-2 border-transparent">
            <CardContent className="p-8 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6">
                <app.icon className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-black mb-1">
                {app.os}
                {!app.link && (
                  <Badge variant="secondary" className="ml-2 text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                    Coming Soon
                  </Badge>
                )}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                v{app.version} • {app.size}
              </p>
              <Button 
                className="w-full font-bold h-12" 
                variant={app.link ? "default" : "outline"}
                disabled={!app.link}
                asChild={!!app.link}
              >
                {app.link ? (
                  <a href={app.link} target="_blank" rel="noopener noreferrer">Download for {app.os}</a>
                ) : (
                  <span>Unavailable</span>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-muted/30 border border-dashed border-muted rounded-3xl p-10 text-center max-w-2xl mx-auto mt-12">
        <h3 className="text-xl font-black mb-2 text-foreground">Need a different version?</h3>
        <p className="text-muted-foreground mb-6">
          Access all historical versions, beta releases, and source code on our official repository.
        </p>
        <Button variant="outline" className="font-bold" asChild>
          <a href={`https://github.com/DumosRx/client/releases`} target="_blank">Browse All Releases</a>
        </Button>
      </div>
    </div>
  );
}

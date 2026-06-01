"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { APP_VERSION, GITHUB_REPO } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Download,
  Monitor,
  ShieldCheck,
  Globe,
  ChevronLeft,
  Smartphone,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { useLatestRelease } from "@/lib/api/github-hooks";

export default function DownloadsPage() {
  const { data: links, isLoading } = useLatestRelease();

  const defaultLinks = {
    windows: `https://github.com/${GITHUB_REPO}/releases/latest`,
    macos: `https://github.com/${GITHUB_REPO}/releases/latest`,
    linux: `https://github.com/${GITHUB_REPO}/releases/latest`,
    android: `https://github.com/${GITHUB_REPO}/releases/latest`,
    version: APP_VERSION,
    winSize: "---",
    macSize: "---",
    linuxSize: "---",
    androidSize: "---",
  };

  const currentLinks = links || defaultLinks;
  const linuxAssetExists = currentLinks.linux && currentLinks.linux.includes("/download/");
  const androidAssetExists = currentLinks.android && currentLinks.android.includes("/download/");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Simple Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container px-6 flex h-16 items-center justify-between mx-auto">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-widest">
              Back to Home
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 bg-muted/30">
          <div className="container px-6 mx-auto text-center">
            <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium leading-5 text-primary ring-1 ring-inset ring-primary/20 bg-primary/5 mb-6">
              Current Version: {isLoading ? "Checking..." : currentLinks.version}
            </div>
            <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
              Take your Pharmacy <br />
              <span className="text-primary">Offline.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Download the DumosRx local client to ensure your business never
              stops, even when the internet does.
            </p>
          </div>
        </section>

        {/* Download Grid */}
        <section className="py-20">
          <div className="container px-6 mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
              {/* Windows Card */}
              <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Monitor className="w-24 h-24" />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Monitor className="w-6 h-6 text-primary" />
                    Windows
                  </CardTitle>
                  <CardDescription className="flex flex-col gap-1 mt-1">
                    <span className="font-semibold text-foreground">
                      {currentLinks.version.startsWith("v") ? currentLinks.version : `v${currentLinks.version}`} • {currentLinks.winSize}
                    </span>
                    <span>Requires Windows 10+ (64-bit)</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Verified Installer (.msi)
                      </div>
                    </div>
                    <Button
                      className="w-full h-12 font-bold shadow-lg shadow-primary/20"
                      asChild
                    >
                      <Link href="/register?redirect=downloads">
                        <Download className="w-4 h-4 mr-2" />
                        Register to Download
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* macOS Card */}
              <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Monitor className="w-24 h-24" />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Monitor className="w-6 h-6 text-primary" />
                    macOS
                  </CardTitle>
                  <CardDescription className="flex flex-col gap-1 mt-1">
                    <span className="font-semibold text-foreground">
                      {currentLinks.version.startsWith("v") ? currentLinks.version : `v${currentLinks.version}`} • {currentLinks.macSize}
                    </span>
                    <span>Intel & Apple Silicon</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Universal Disk Image (.dmg)
                      </div>
                    </div>
                    <Button
                      className="w-full h-12 font-bold shadow-lg shadow-primary/20"
                      asChild
                    >
                      <Link href="/register?redirect=downloads">
                        <Download className="w-4 h-4 mr-2" />
                        Register to Download
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Linux Card */}
              <Card
                className={cn(
                  "relative overflow-hidden border-2 transition-colors group",
                  !linuxAssetExists
                    ? "opacity-80 border-dashed"
                    : "hover:border-primary/50",
                )}
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Globe className="w-24 h-24" />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Globe className="w-6 h-6 text-primary" />
                    Linux
                  </CardTitle>
                  <CardDescription className="flex flex-col gap-1 mt-1">
                    {linuxAssetExists ? (
                      <>
                        <span className="font-semibold text-foreground">
                          {currentLinks.version.startsWith("v") ? currentLinks.version : `v${currentLinks.version}`} • {currentLinks.linuxSize}
                        </span>
                        <span>Portable AppImage</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-amber-600 dark:text-amber-500">Coming Soon</span>
                        <span>AppImage / Deb</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ShieldCheck
                          className={cn(
                            "w-4 h-4",
                            linuxAssetExists
                              ? "text-emerald-500"
                              : "text-slate-400",
                          )}
                        />
                        {linuxAssetExists
                          ? "Verified AppImage"
                          : "Portable AppImage"}
                      </div>
                    </div>
                    {linuxAssetExists ? (
                      <Button
                        className="w-full h-12 font-bold shadow-lg shadow-primary/20"
                        asChild
                      >
                        <Link href="/register?redirect=downloads">
                          <Download className="w-4 h-4 mr-2" />
                          Register to Download
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full h-12 font-bold opacity-50 cursor-not-allowed"
                        disabled
                      >
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Android Card */}
              <Card
                className={cn(
                  "relative overflow-hidden border-2 transition-colors group",
                  !androidAssetExists
                    ? "opacity-80 border-dashed"
                    : "hover:border-primary/50",
                )}
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Smartphone className="w-24 h-24" />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Smartphone className="w-6 h-6 text-primary" />
                    Android
                  </CardTitle>
                  <CardDescription className="flex flex-col gap-1 mt-1">
                    {androidAssetExists ? (
                      <>
                        <span className="font-semibold text-foreground">
                          {currentLinks.version.startsWith("v") ? currentLinks.version : `v${currentLinks.version}`} • {currentLinks.androidSize}
                        </span>
                        <span>Requires Android 6.0+</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-amber-600 dark:text-amber-500">Coming Soon</span>
                        <span>APK Package</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ShieldCheck
                          className={cn(
                            "w-4 h-4",
                            androidAssetExists
                              ? "text-emerald-500"
                              : "text-slate-400",
                          )}
                        />
                        {androidAssetExists
                          ? "Signed APK Installer"
                          : "APK Installer"}
                      </div>
                    </div>
                    {androidAssetExists ? (
                      <Button
                        className="w-full h-12 font-bold shadow-lg shadow-primary/20"
                        asChild
                      >
                        <Link href="/register?redirect=downloads">
                          <Download className="w-4 h-4 mr-2" />
                          Register to Download
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full h-12 font-bold opacity-50 cursor-not-allowed"
                        disabled
                      >
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="py-20 border-t">
          <div className="container px-6 mx-auto max-w-4xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">
                Frequently Asked Questions
              </h2>
            </div>
            <div className="grid gap-8">
              <div className="space-y-2">
                <h4 className="font-bold">Why do I need the desktop app?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  While the web dashboard is great for monitoring your business
                  from anywhere, the desktop app is built for the "front-line".
                  It works without internet, connects directly to thermal
                  printers, and is optimized for fast retail sales.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold">Is my data safe?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Yes. All data stored locally is encrypted. As soon as you have
                  an internet connection, the app securely syncs your data to
                  our cloud servers so you never lose a record.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Simple Footer */}
      <footer className="py-12 border-t">
        <div className="container px-6 mx-auto text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Dumos Technologies. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

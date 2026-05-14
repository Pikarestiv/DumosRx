"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
  Zap,
  Globe,
  ArrowRight,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function DownloadsPage() {
  const GITHUB_REPO = "Pikarestiv/DumosRx";
  const [links, setLinks] = useState({
    windows: `https://github.com/${GITHUB_REPO}/releases/latest`,
    macos: `https://github.com/${GITHUB_REPO}/releases/latest`,
    version: "v0.0.5",
    loading: true,
  });

  useEffect(() => {
    async function fetchLatestRelease() {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        const data = await res.json();
        
        if (data.assets) {
          // Look for any asset ending in .msi (Windows) or .dmg (macOS)
          const winAsset = data.assets.find((a: any) => a.name.toLowerCase().endsWith(".msi"));
          const macAsset = data.assets.find((a: any) => a.name.toLowerCase().endsWith(".dmg"));
          
          setLinks({
            windows: winAsset?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            macos: macAsset?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            version: data.tag_name || "v0.0.5",
            loading: false,
          });
        }
      } catch (err) {
        console.error("Failed to fetch latest release:", err);
        setLinks(prev => ({ ...prev, loading: false }));
      }
    }
    fetchLatestRelease();
  }, []);

  const WINDOWS_URL = links.windows;
  const MACOS_URL = links.macos;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Simple Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container px-6 flex h-16 items-center justify-between mx-auto">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-widest">Back to Home</span>
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
              Current Version: {links.loading ? "Checking..." : links.version}
            </div>
            <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
              Take your Pharmacy <br />
              <span className="text-primary">Offline.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Download the DumosRx local client to ensure your business never stops, 
              even when the internet does.
            </p>
          </div>
        </section>

        {/* Download Grid */}
        <section className="py-20">
          <div className="container px-6 mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Windows Card */}
              <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Monitor className="w-32 h-32" />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Monitor className="w-6 h-6 text-primary" />
                    Windows
                  </CardTitle>
                  <CardDescription>
                    Requires Windows 10 or later (64-bit)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Verified Installer (.msi)
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Full Offline Support
                      </div>
                    </div>
                    <Button className="w-full h-12 font-bold shadow-lg shadow-primary/20" asChild>
                      <a href={WINDOWS_URL}>
                        <Download className="w-4 h-4 mr-2" />
                        Download for Windows
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* macOS Card */}
              <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Monitor className="w-32 h-32" />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Monitor className="w-6 h-6 text-primary" />
                    macOS
                  </CardTitle>
                  <CardDescription>
                    Supports Intel & Apple Silicon (M1/M2/M3)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Universal Disk Image (.dmg)
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Native Performance
                      </div>
                    </div>
                    <Button className="w-full h-12 font-bold shadow-lg shadow-primary/20" asChild>
                      <a href={MACOS_URL}>
                        <Download className="w-4 h-4 mr-2" />
                        Download for macOS
                      </a>
                    </Button>
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
              <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            </div>
            <div className="grid gap-8">
              <div className="space-y-2">
                <h4 className="font-bold">Why do I need the desktop app?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  While the web dashboard is great for monitoring your business from anywhere, 
                  the desktop app is built for the "front-line". It works without internet, 
                  connects directly to thermal printers, and is optimized for fast retail sales.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold">Is my data safe?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Yes. All data stored locally is encrypted. As soon as you have an internet connection, 
                  the app securely syncs your data to our cloud servers so you never lose a record.
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
            © {new Date().getFullYear()} Dumos Technologies. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

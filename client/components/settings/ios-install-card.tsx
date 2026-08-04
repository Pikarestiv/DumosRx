"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, Smartphone } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { isTauri } from "@/lib/db/core";

function isIos() {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * iOS forces every browser to use WebKit, but "Add to Home Screen" only
 * produces a real standalone-mode install in Safari itself — Chrome/Firefox/
 * Edge on iOS (CriOS/FxiOS/EdgiOS) expose either no equivalent or a plain
 * bookmark shortcut that reopens inside their own browser chrome. So this
 * needs to detect actual Safari, not just "is this an iOS device".
 */
function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
  return /Safari/.test(ua) && !isOtherIosBrowser;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

const steps = [
  {
    icon: Share,
    text: (
      <>
        Tap the <span className="font-semibold text-foreground">Share</span>{" "}
        button in Safari&apos;s toolbar
      </>
    ),
  },
  {
    icon: SquarePlus,
    text: (
      <>
        Scroll down and tap{" "}
        <span className="font-semibold text-foreground">
          Add to Home Screen
        </span>
        , then confirm with{" "}
        <span className="font-semibold text-foreground">Add</span>
      </>
    ),
  },
];

/** Shown only on iOS Safari when not already running as an installed
 * PWA/desktop app — iOS has no automatic install prompt (unlike Android
 * Chrome's beforeinstallprompt), so this is the only way to guide users
 * to a full-screen, app-like experience. */
export function IosInstallCard() {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"hidden" | "safari" | "other-browser">("hidden");

  useEffect(() => {
    if (isTauri() || !isIos() || isStandalone()) {
      setVisibility("hidden");
    } else {
      setVisibility(isIosSafari() ? "safari" : "other-browser");
    }
  }, []);

  if (visibility === "hidden") return null;

  if (visibility === "other-browser") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Install on iPhone/iPad</CardTitle>
          <CardDescription>
            This browser can&apos;t install DumosRx as an app — iOS only
            supports adding apps to the Home Screen from{" "}
            <span className="font-semibold text-foreground">Safari</span>.
            Open this page in Safari instead to continue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Install on iPhone/iPad</CardTitle>
          <CardDescription>
            Add DumosRx to your Home Screen for a full-screen, app-like
            experience — no App Store needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Smartphone className="h-4 w-4" />
            Show Instructions
          </Button>
        </CardContent>
      </Card>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={
          <span className="font-serif font-bold text-xl">
            Add to Home Screen
          </span>
        }
        description="Follow these steps to install DumosRx as an app on this device."
      >
        <ol className="space-y-4 py-2 px-4 sm:px-0">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                {i + 1}
              </div>
              <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                <step.icon className="h-4 w-4 shrink-0 text-primary" />
                <span>{step.text}</span>
              </div>
            </li>
          ))}
        </ol>
      </ResponsiveModal>
    </>
  );
}

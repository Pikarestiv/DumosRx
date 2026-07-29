"use client";

import { Share, SquarePlus, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WEB_APP_DASHBOARD_URL } from "@/lib/constants";

interface IosInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** iOS can't install arbitrary native apps, so the dashboard is offered as a
 * home-screen PWA instead — Safari only exposes "Add to Home Screen" via the
 * Share sheet, with no install prompt to trigger programmatically. */
export function IosInstallDialog({ open, onOpenChange }: IosInstallDialogProps) {
  const dashboardHost = WEB_APP_DASHBOARD_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const steps = [
    {
      icon: Smartphone,
      text: (
        <>
          Open <span className="font-semibold text-foreground">Safari</span>{" "}
          and go to{" "}
          <span className="font-semibold text-foreground">{dashboardHost}</span>
        </>
      ),
    },
    {
      icon: Share,
      text: (
        <>
          Tap the{" "}
          <span className="font-semibold text-foreground">Share</span> button
          in the toolbar
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install DumosRx on iPhone/iPad</DialogTitle>
          <DialogDescription>
            iOS doesn&apos;t support direct app downloads outside the App
            Store, but you can add DumosRx to your Home Screen for a
            full-screen, app-like experience.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4 py-2">
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

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Must be opened in Safari — Chrome and other iOS browsers don&apos;t
          support adding to the Home Screen.
        </p>
      </DialogContent>
    </Dialog>
  );
}

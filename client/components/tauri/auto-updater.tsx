"use client";

import { useState, useEffect } from "react";
import { DownloadCloud, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isTauri } from "@/lib/db/core";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "error" | "up-to-date";

export function AutoUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(isTauri());
    if (isTauri()) {
      // Check for updates in the background on mount
      checkForUpdates(true);
    }
  }, []);

  const checkForUpdates = async (silent = false) => {
    if (!isTauri()) return;
    
    try {
      if (!silent) setStatus("checking");
      
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      
      if (update) {
        setUpdateInfo(update);
        setStatus("available");
      } else {
        if (!silent) {
          setStatus("up-to-date");
          setTimeout(() => setStatus("idle"), 5000);
        }
      }
    } catch (error) {
      console.error("Failed to check for updates", error);
      if (!silent) {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 5000);
      }
    }
  };

  const installUpdate = async () => {
    if (!updateInfo) return;
    
    try {
      setStatus("downloading");
      let downloaded = 0;
      let totalLength = 0;
      
      await updateInfo.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalLength > 0) {
              setProgress(Math.round((downloaded / totalLength) * 100));
            }
            break;
          case 'Finished':
            setProgress(100);
            break;
        }
      });
      
      toast.success("Update installed successfully. Restarting application...");
      
      setTimeout(async () => {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }, 1500);
      
    } catch (error) {
      console.error("Failed to install update", error);
      toast.error("Failed to install the update.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  if (!isDesktop) return null;

  if (status === "idle" || status === "up-to-date" || status === "error") {
    return (
      <div className="fixed bottom-6 right-6 z-50 group">
        <button 
          onClick={() => checkForUpdates(false)}
          className="flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur-md border border-accent/20 dark:border-white/10 shadow-sm rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:shadow-md transition-all hover:bg-accent/5 dark:hover:bg-white/5"
        >
          {status === "up-to-date" ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Up to date</>
          ) : status === "error" ? (
            <><AlertCircle className="h-3.5 w-3.5 text-rose-500" /> Update failed</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5" /> Check for updates</>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 shadow-2xl bg-background border border-accent/20 dark:border-white/20 p-5 rounded-2xl w-[340px] transition-all animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2.5 text-sm font-bold">
          {status === "checking" && (
            <><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> Checking for updates...</>
          )}
          {status === "available" && (
            <><Sparkles className="h-5 w-5 text-primary animate-pulse" /> New Update Available!</>
          )}
          {status === "downloading" && (
            <><DownloadCloud className="h-5 w-5 text-primary animate-bounce" /> Installing Update...</>
          )}
        </div>
        {status !== "downloading" && (
          <button 
            onClick={() => setStatus("idle")} 
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {status === "available" && updateInfo && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Version <span className="font-bold text-foreground">{updateInfo.version}</span> is ready to install. Update now to enjoy the latest features and improvements!
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={() => setStatus("idle")} className="text-xs">Later</Button>
            <Button size="sm" onClick={installUpdate} className="text-xs font-bold px-4">
              Update Now
            </Button>
          </div>
        </div>
      )}

      {status === "downloading" && (
        <div className="space-y-2 pt-2">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out" 
              style={{ width: `${progress}%` }} 
            />
          </div>
          <p className="text-[10px] font-medium text-muted-foreground text-right uppercase tracking-wider">
            {progress}% Completed
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { DownloadCloud, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isTauri } from "@/lib/db/core";
import { DOWNLOAD_URL, UPDATER_JSON_URL } from "@/lib/constants";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "downloading-silent" | "ready-to-restart" | "error" | "up-to-date" | "mobile-available";

export function AutoUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [isApp, setIsApp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsApp(isTauri());
    if (isTauri()) {
      // Determine if we are on mobile using plugin-os
      import("@tauri-apps/plugin-os").then(({ type }) => {
        const osType = type();
        const mobile = osType === 'ios' || osType === 'android';
        setIsMobile(mobile);
        
        if (mobile) {
          checkMobileUpdate();
        } else {
          checkForUpdates(true);
        }
      }).catch((e) => {
        console.error("Failed to load plugin-os", e);
        // Fallback to desktop check
        checkForUpdates(true);
      });
    }
  }, []);

  const checkMobileUpdate = async () => {
    try {
      // For mobile, manually fetch the updater.json to see if a newer version exists
      const response = await fetch(UPDATER_JSON_URL);
      if (response.ok) {
        const data = await response.json();
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();
        
        if (data.version && data.version !== currentVersion) {
          setUpdateInfo(data);
          setStatus("mobile-available");
        }
      }
    } catch (error) {
      console.error("Failed to check mobile updates", error);
    }
  };

  const checkForUpdates = async (silent = false) => {
    if (!isTauri() || isMobile) return;
    
    try {
      if (!silent) setStatus("checking");
      
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      
      if (update) {
        setUpdateInfo(update);
        
        const { getVersion } = await import("@tauri-apps/api/app");
        const currentVersion = await getVersion();
        
        const currentMajor = parseInt(currentVersion.split('.')[0] || "0");
        const newMajor = parseInt(update.version.split('.')[0] || "0");
        
        if (newMajor > currentMajor) {
          // Major update: require explicit user consent
          setStatus("available");
        } else {
          // Minor/Patch update: silent background download
          setStatus("downloading-silent");
          installUpdate(update, true);
        }
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

  const installUpdate = async (updateToInstall: any = updateInfo, silent = false) => {
    if (!updateToInstall) return;
    
    try {
      if (!silent) setStatus("downloading");
      let downloaded = 0;
      let totalLength = 0;
      
      await updateToInstall.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalLength > 0 && !silent) {
              setProgress(Math.round((downloaded / totalLength) * 100));
            }
            break;
          case 'Finished':
            if (!silent) setProgress(100);
            break;
        }
      });
      
      if (silent) {
        setStatus("ready-to-restart");
      } else {
        toast.success("Update installed successfully. Restarting application...");
        setTimeout(async () => {
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to install update", error);
      if (!silent) toast.error("Failed to install the update.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  const performRestart = async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      console.error("Failed to restart", error);
    }
  };

  const openDownloadLink = () => {
    window.open(DOWNLOAD_URL, "_blank");
    setStatus("idle");
  };

  if (!isApp) return null;

  if (status === "idle" || status === "up-to-date" || status === "error" || status === "downloading-silent") {
    // Only show the manual check button if we are not on mobile
    if (isMobile) return null;
    
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
          ) : status === "downloading-silent" ? (
            <><DownloadCloud className="h-3.5 w-3.5 animate-pulse text-primary" /> Downloading patch...</>
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
          {(status === "available" || status === "mobile-available") && (
            <><Sparkles className="h-5 w-5 text-primary animate-pulse" /> New Update Available!</>
          )}
          {status === "downloading" && (
            <><DownloadCloud className="h-5 w-5 text-primary animate-bounce" /> Installing Update...</>
          )}
          {status === "ready-to-restart" && (
            <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Update Ready to Apply</>
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
            Version <span className="font-bold text-foreground">{updateInfo.version}</span> is ready to install. This is a major update featuring new improvements!
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={() => setStatus("idle")} className="text-xs">Later</Button>
            <Button size="sm" onClick={() => installUpdate()} className="text-xs font-bold px-4">
              Update Now
            </Button>
          </div>
        </div>
      )}

      {status === "ready-to-restart" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            A new patch has been downloaded securely in the background. Restart the application to apply the fixes.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={() => setStatus("idle")} className="text-xs">Later</Button>
            <Button size="sm" onClick={performRestart} className="text-xs font-bold px-4 bg-emerald-600 hover:bg-emerald-700">
              Restart to Apply
            </Button>
          </div>
        </div>
      )}

      {status === "mobile-available" && updateInfo && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Version <span className="font-bold text-foreground">{updateInfo.version}</span> is available for DumosRx. Please download the latest update from your app store or our website.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={() => setStatus("idle")} className="text-xs">Later</Button>
            <Button size="sm" className="text-xs font-bold px-4 flex items-center gap-1.5" asChild onClick={() => setStatus("idle")}>
              <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Download Update
              </a>
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

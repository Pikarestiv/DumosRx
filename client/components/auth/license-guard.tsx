"use client";

import { useEffect, useState } from "react";
import { checkLicenseStatus, LicenseInfo } from "@/lib/licensing/licensing-manager";
import { 
  AlertOctagon, 
  RefreshCw, 
  Clock, 
  Lock,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/context/store-context";

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { storeProfile } = useStore();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("DUMOS-OFFLINE-772X");

  const performCheck = async () => {
    setLoading(true);
    
    // Sync status with server first if online
    if (typeof window !== "undefined" && navigator.onLine) {
      try {
        const { sync } = await import("@/lib/db/sync-engine");
        await sync();
      } catch (e) {
        console.error("[LicenseGuard] Failed to sync on status refresh:", e);
      }
    }

    const status = await checkLicenseStatus();
    setLicense(status);
    setLoading(false);
  };

  // Generate or load device ID on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("dumos_device_id");
      if (!id) {
        id = "DRX-" + Math.random().toString(36).substring(2, 11).toUpperCase();
        localStorage.setItem("dumos_device_id", id);
      }
      setDeviceId(id);
    }
  }, []);

  // Reactive to local SQLite store profile status changes
  useEffect(() => {
    performCheck();
  }, [storeProfile?.status, storeProfile?.suspension_reason]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  // If license is valid, render children
  if (license?.isValid) {
    return <>{children}</>;
  }

  const isSuspended = license?.message?.includes("suspended") || false;

  // If clock is tampered or license expired/suspended, show lock screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
            {license?.isClockTampered ? <Clock className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
          </div>
          <CardTitle className="text-2xl font-black">
            {license?.isClockTampered 
              ? "Clock Discrepancy" 
              : isSuspended 
                ? "Account Suspended" 
                : "Subscription Expired"}
          </CardTitle>
          <CardDescription>
            {license?.message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="flex items-center gap-2 font-bold text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
              <AlertOctagon className="h-3 w-3" />
              Technical Details
            </p>
            <p>Device ID: {deviceId}</p>
            {license?.expiryDate && <p>Last Valid Date: {new Date(license.expiryDate).toLocaleDateString()}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {!isSuspended && (
            <>
              <Button className="w-full bg-accent hover:bg-accent/90 font-bold" onClick={performCheck}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="https://dumosrx.com/billing" target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Renew Subscription
                </a>
              </Button>
            </>
          )}
          {isSuspended && (
            <Button className="w-full bg-accent hover:bg-accent/90 font-bold" onClick={performCheck}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Account Status
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

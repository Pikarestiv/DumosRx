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

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const performCheck = async () => {
    setLoading(true);
    const status = await checkLicenseStatus();
    setLicense(status);
    setLoading(false);
  };

  useEffect(() => {
    performCheck();
  }, []);

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

  // If clock is tampered or license expired, show lock screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
            {license?.isClockTampered ? <Clock className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
          </div>
          <CardTitle className="text-2xl font-black">
            {license?.isClockTampered ? "Clock Discrepancy" : "Subscription Expired"}
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
            <p>Device ID: DUMOS-OFFLINE-772X</p>
            {license?.expiryDate && <p>Last Valid Date: {new Date(license.expiryDate).toLocaleDateString()}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
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
        </CardFooter>
      </Card>
    </div>
  );
}

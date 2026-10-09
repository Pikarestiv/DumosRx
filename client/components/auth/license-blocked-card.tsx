"use client";

import { useState } from "react";
import { Clock, Lock, AlertOctagon, RefreshCw, ExternalLink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { AdminTillLogin } from "./admin-till-login";
import { TillInspectionBanner } from "@/components/dashboard/till-inspection-banner";
import { overrideClockLockout } from "@/lib/licensing/licensing-manager";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import type { LicenseInfo } from "@/lib/licensing/licensing-manager";

interface Props {
  license: LicenseInfo | null;
  deviceId: string;
  clockNotice: string | null;
  isSuspended: boolean;
  onRecheck: () => void;
}

/**
 * The full-screen card LicenseGuard renders INSTEAD of its children when a
 * device is blocked. Extracted because license-guard.tsx was 436 lines, over
 * the 350-line limit in root AGENTS.md §4.
 *
 * It carries the on-till admin entry because nothing else can: while this card
 * is up there is no app, no lock screen and no "someone else" — so an admin
 * standing at a clock-tampered till would otherwise have no way in, and the
 * clock override would be unreachable. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
export function LicenseBlockedCard({
  license,
  deviceId,
  clockNotice,
  isSuspended,
  onRecheck,
}: Props) {
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [inspecting, setInspecting] = useState(() => isTillInspectionSession());
  const [isOverriding, setIsOverriding] = useState(false);

  const override = async () => {
    setIsOverriding(true);
    try {
      const result = await overrideClockLockout();
      if (result.ok) {
        toast.success(result.reason);
        onRecheck();
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not override the clock lock.");
    }
    setIsOverriding(false);
  };

  return (

    <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
      <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
            {license?.isClockTampered ? (
              <Clock className="h-8 w-8" />
            ) : (
              <Lock className="h-8 w-8" />
            )}
          </div>
          <CardTitle className="text-2xl font-black">
            {license?.isClockTampered
              ? "Clock Discrepancy"
              : isSuspended
                ? "Account Suspended"
                : "Subscription Expired"}
          </CardTitle>
          <CardDescription>{license?.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="flex items-center gap-2 font-bold text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
              <AlertOctagon className="h-3 w-3" />
              Technical Details
            </p>
            <p>Device ID: {deviceId}</p>
            {license?.expiryDate && (
              <p>Last Valid Date: {formatDateToDDMMYYYY(license.expiryDate)}</p>
            )}
            {license?.isClockTampered && license?.localTime && (
              <p>This device reads: {new Date(license.localTime).toLocaleString("en-GB")}</p>
            )}
            {license?.isClockTampered && license?.monotonicWatermark && (
              <p>
                Last recorded activity:{" "}
                {new Date(license.monotonicWatermark).toLocaleString("en-GB")}
              </p>
            )}
            {clockNotice && <p className="mt-2 text-destructive">{clockNotice}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {!isSuspended && (
            <>
              <Button
                className="w-full bg-accent hover:bg-accent/90 font-bold"
                onClick={() => onRecheck()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.location.href = "/settings/billing";
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Renew Subscription
              </Button>
            </>
          )}
          {isSuspended && (
            <Button
              className="w-full bg-accent hover:bg-accent/90 font-bold"
              onClick={() => onRecheck()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Account Status
            </Button>
          )}
          {license?.isClockTampered && inspecting && (
            <Button
              variant="outline"
              className="w-full"
              disabled={isOverriding}
              onClick={() => void override()}
            >
              <Wrench className="h-4 w-4 mr-2" />
              Clear clock lock as admin
            </Button>
          )}
          {!inspecting &&
            (showAdminLogin ? (
              <div className="w-full pt-2">
                <AdminTillLogin
                  onSuccess={() => {
                    setInspecting(true);
                    setShowAdminLogin(false);
                  }}
                  onCancel={() => setShowAdminLogin(false)}
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setShowAdminLogin(true)}
              >
                Admin access
              </Button>
            ))}
        </CardFooter>
      </Card>
    </div>
  );
}

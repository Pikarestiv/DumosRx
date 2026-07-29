"use client";

import { Store, Lock, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { WEB_APP_URL } from "@/lib/constants";

export function MultiStoreCard() {
  const { canManageMultiStore, getUpgradeMessage } = useFeatureGate();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multiple Stores</CardTitle>
        <CardDescription>
          Run more than one location under the same account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <Store className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {canManageMultiStore ? "Add another store" : "Multi-store locked"}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {canManageMultiStore
                  ? "Creating and managing additional stores is done from your web dashboard, so every device syncing to this account stays in sync with the same list."
                  : getUpgradeMessage(
                      "multi_store",
                      "Running multiple stores is available on higher plans.",
                    )}
              </p>
            </div>
          </div>

          <Button
            variant={canManageMultiStore ? "outline" : "default"}
            className="shrink-0"
            asChild
          >
            <a
              href={
                canManageMultiStore
                  ? `${WEB_APP_URL}/dashboard/stores`
                  : `${WEB_APP_URL}/dashboard/billing`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {canManageMultiStore ? (
                <>
                  Open Dashboard
                  <ExternalLink className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </>
              )}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

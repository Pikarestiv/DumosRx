"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { useSyncRolesMutation } from "@/lib/api/admin-hooks-maintenance";

export function RolesSyncPanel() {
  const [confirming, setConfirming] = useState(false);
  const sync = useSyncRolesMutation();

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Roles and permissions
        </CardTitle>
        <CardDescription>
          Applies newly declared roles and permissions. Migrating no longer does this, so a
          permission added in a release does not exist here until this runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          className="border-2 font-bold"
          onClick={() => setConfirming(true)}
          disabled={sync.isPending}
        >
          Sync roles and permissions
        </Button>

        {sync.data?.output && (
          <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground rounded-md border border-border bg-muted/50 p-3">
            {sync.data.output}
          </pre>
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent role="alertdialog" className="bg-background/95 backdrop-blur-sm border shadow-sm">
          <DialogHeader>
            <DialogTitle>Sync roles and permissions?</DialogTitle>
            <DialogDescription>
              This seeds any missing role or permission and resets each built-in role&apos;s
              permission set to what the code declares. Custom roles are left alone, and no
              existing row is overwritten. It does not touch user accounts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={sync.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Roles and permissions synced");
                    setConfirming(false);
                  },
                  onError: () => {
                    toast.error("Sync failed — check the output");
                    setConfirming(false);
                  },
                })
              }
              disabled={sync.isPending}
            >
              {sync.isPending ? "Syncing…" : "Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

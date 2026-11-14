"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRebuildStorefrontsMutation } from "@/lib/api/admin-hooks";

export function StorefrontRebuildButton() {
  const rebuild = useRebuildStorefrontsMutation();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)} disabled={rebuild.isPending}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Rebuild storefronts now
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Rebuild every storefront?"
        description="This rebuilds and redeploys the public site, so every store's pending style and detail changes go live together. It takes a few minutes, and storefronts keep working while it runs."
        confirmLabel="Rebuild now"
        onConfirm={() =>
          rebuild.mutate(undefined, {
            onSuccess: (response) => toast.success(response.message),
            onError: (error) =>
              toast.error(error instanceof Error && error.message ? error.message : "Could not request the rebuild"),
          })
        }
      />
    </>
  );
}

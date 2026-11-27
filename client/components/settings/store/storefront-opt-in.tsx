import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";
import type { ReactNode } from "react";
import { useOptInStorefront, useStorefrontSettings } from "@/lib/hooks/use-storefront-settings";

export function StorefrontOptIn({ entitlements }: { entitlements: StorefrontEntitlements }) {
  const optIn = useOptInStorefront();
  const cap = entitlements.max_online_products;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Your plan includes an online store: {cap !== null ? `up to ${cap} products you choose, ` : ""}orders by WhatsApp or the
        cart, with pickup or pay on delivery. Nothing goes online until you turn it on.
      </p>
      <Button
        type="button"
        disabled={optIn.isPending}
        onClick={() =>
          optIn.mutate(undefined, {
            onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "Could not turn on your online store"),
          })
        }
      >
        {optIn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
        Turn on my online store
      </Button>
    </div>
  );
}

export function StorefrontOptInGate({ entitlements, children }: { entitlements: StorefrontEntitlements; children: ReactNode }) {
  const settings = useStorefrontSettings(true);

  if (settings.isLoading) return null;
  if (settings.data?.opt_in_required === true && settings.data.opted_in === false) return <StorefrontOptIn entitlements={entitlements} />;
  return <>{children}</>;
}

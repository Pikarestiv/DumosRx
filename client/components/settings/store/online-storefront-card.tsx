import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STOREFRONT_BASE_URL } from "@/lib/constants";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { storefrontUrl } from "@/lib/utils/storefront-url";
import { StorefrontAppearance } from "./storefront-appearance";

interface OnlineStorefrontCardProps {
  localStoreSlug?: string;
  onlineStoreEnabled?: boolean;
}

const CONTACT_TO_SET_UP =
  "Contact your account manager and they will set it up for you.";
const CONTACT_TO_SWITCH_ON = "Contact your account manager to switch it on.";

export function OnlineStorefrontCard({
  localStoreSlug,
  onlineStoreEnabled = false,
}: OnlineStorefrontCardProps) {
  const canManageOnlineStore = useHasPermission("manage_online_store");
  const [copied, setCopied] = useState(false);

  if (!canManageOnlineStore) return null;

  const slug = localStoreSlug?.trim();
  const url = slug ? storefrontUrl(STOREFRONT_BASE_URL, slug) : null;
  const live = Boolean(url && onlineStoreEnabled);

  const handleCopy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Store link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Online Storefront</CardTitle>
        <CardDescription>
          Your public online store, where customers can browse and order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!url ? (
          <p className="text-sm">
            Your online store isn&apos;t set up yet. {CONTACT_TO_SET_UP}
          </p>
        ) : (
          <>
            <p className="text-sm">
              {live
                ? "Your online store is available at:"
                : "Your online store address is reserved, but it isn't switched on yet:"}
            </p>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <span className="break-all text-sm font-medium">{url}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  type="button"
                  aria-label="Copy storefront link"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                {live ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open your online store"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
            {live ? (
              <div className="border-t pt-4">
                <StorefrontAppearance />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {CONTACT_TO_SWITCH_ON}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

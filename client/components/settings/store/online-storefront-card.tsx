import { Copy, Check, Edit2, Pencil, Save, X } from "lucide-react";
import { addMonths, format, isAfter } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { STOREFRONT_BASE_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { HelpTooltip } from "./help-tooltip";
import { StorefrontAppearance } from "./storefront-appearance";

interface OnlineStorefrontCardProps {
  localStoreSlug?: string;
  setLocalStoreSlug?: (val: string) => void;
  storeSlugChangedAt?: string | null;
  onlineStoreEnabled?: boolean;
  setOnlineStoreEnabled?: (val: boolean) => void;
  handleSaveProfile: () => void;
}

export function OnlineStorefrontCard({
  localStoreSlug,
  setLocalStoreSlug,
  storeSlugChangedAt,
  onlineStoreEnabled = false,
  setOnlineStoreEnabled,
  handleSaveProfile,
}: OnlineStorefrontCardProps) {
  const canManageOnlineStore = useHasPermission("manage_online_store");
  const { canUseEcommerce, withRestriction, getUpgradeMessage } =
    useFeatureGate();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!canManageOnlineStore) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(
      `${STOREFRONT_BASE_URL}/${localStoreSlug}`,
    );
    setCopied(true);
    toast.success("Store link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Mirrors the server's 6-month slug cooldown (Store::boot()); a first-ever slug is never locked.
  const nextEligibleSlugChange = storeSlugChangedAt
    ? addMonths(new Date(storeSlugChangedAt), 6)
    : null;
  const slugChangeLocked =
    !!nextEligibleSlugChange && isAfter(nextEligibleSlugChange, new Date());

  const handleEditClick = () => {
    if (!canUseEcommerce) {
      toast.error(
        getUpgradeMessage(
          "store_url",
          "Upgrade to a premium plan to customize your storefront URL.",
        ),
      );
      return;
    }
    if (slugChangeLocked && nextEligibleSlugChange) {
      toast.error(
        `You can change your storefront URL once every 6 months. You'll be able to change it again on ${format(nextEligibleSlugChange, "d MMM yyyy")} — contact support if you need it sooner.`,
      );
      return;
    }
    setIsEditingSlug(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Online Storefront</CardTitle>
          <CardDescription>
            Your public online store: its web address, and whether customers can
            browse and order.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            isEditing
              ? "Stop editing online storefront"
              : "Edit online storefront"
          }
          onClick={() => {
            setIsEditing(!isEditing);
            setIsEditingSlug(false);
          }}
        >
          {isEditing ? (
            <X className="h-4 w-4" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="store-slug">Store URL Slug</Label>
            <HelpTooltip>
              Your unique web address where customers can browse your products
              online.
            </HelpTooltip>
          </div>
          {isEditing ? (
            <>
              {isEditingSlug ? (
                <div className="flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    {STOREFRONT_BASE_URL}/
                  </span>
                  <Input
                    id="store-slug"
                    className="rounded-l-none"
                    placeholder="my-store"
                    value={localStoreSlug || ""}
                    onChange={(e) => setLocalStoreSlug?.(e.target.value)}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                  <span className="text-sm font-medium">
                    {STOREFRONT_BASE_URL}/{localStoreSlug}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Copy storefront link"
                      onClick={handleCopy}
                      type="button"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Edit storefront URL"
                      onClick={handleEditClick}
                      type="button"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-[0.8rem] text-muted-foreground">
                This will be your unique public storefront link.
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium py-2">
                {STOREFRONT_BASE_URL}/{localStoreSlug}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Copy storefront link"
                onClick={handleCopy}
                type="button"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label className="text-base">Enable Online Store</Label>
              <HelpTooltip>
                When off, your storefront link above is unreachable: customers
                see a 404 even with the correct URL. Products also need
                &quot;Show Online&quot; turned on individually in each
                product&apos;s Additional Details.
              </HelpTooltip>
            </div>
            <p className="text-sm text-muted-foreground">
              Let customers browse and order from {STOREFRONT_BASE_URL}/
              {localStoreSlug || "your-store"}
            </p>
          </div>
          {isEditing ? (
            <Switch
              id="online-store-enabled"
              checked={onlineStoreEnabled}
              onCheckedChange={(val) => {
                if (!canUseEcommerce) {
                  toast.error(
                    getUpgradeMessage(
                      "ecommerce",
                      "Upgrade to a premium plan to enable your online store.",
                    ),
                  );
                  return;
                }
                setOnlineStoreEnabled?.(val);
              }}
            />
          ) : (
            <p className="text-sm font-medium py-2">
              {onlineStoreEnabled ? "Enabled" : "Disabled"}
            </p>
          )}
        </div>
        {localStoreSlug ? (
          <div className="border-t pt-4">
            <StorefrontAppearance />
          </div>
        ) : null}
      </CardContent>
      {isEditing && (
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={() => {
              withRestriction(handleSaveProfile)();
              setIsEditing(false);
              setIsEditingSlug(false);
            }}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

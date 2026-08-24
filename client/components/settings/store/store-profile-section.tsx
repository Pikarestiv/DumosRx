import { Copy, Check, Info, Edit2 } from "lucide-react";
import { STOREFRONT_BASE_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StoreType } from "@/lib/context/store-context";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StoreProfileSectionProps {
  storeType: StoreType;
  isEditingProfile: boolean;
  localStoreSlug?: string;
  setLocalStoreSlug?: (val: string) => void;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
  onlineStoreEnabled?: boolean;
  setOnlineStoreEnabled?: (val: boolean) => void;
  canUseEcommerce: boolean;
  getUpgradeMessage: (feature: string, fallback?: string) => string;
}

/** The parts of Business Information that are specific to this store's
 * storefront presence, kept visually nested since a business may eventually
 * run more than one store under the same identity above. */
export function StoreProfileSection({
  storeType,
  isEditingProfile,
  localStoreSlug,
  setLocalStoreSlug,
  localPcn,
  setLocalPcn,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
  onlineStoreEnabled = false,
  setOnlineStoreEnabled,
  canUseEcommerce,
  getUpgradeMessage,
}: StoreProfileSectionProps) {
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${STOREFRONT_BASE_URL}/${localStoreSlug}`);
    setCopied(true);
    toast.success("Store link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditClick = () => {
    if (!canUseEcommerce) {
      toast.error(getUpgradeMessage('store_url', "Upgrade to a premium plan to customize your storefront URL."));
      return;
    }
    setIsEditingSlug(true);
  };

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Store Profile</h4>
        <p className="text-xs text-muted-foreground">
          This store's public storefront settings.
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="store-slug">Store URL Slug</Label>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Your unique web address where customers can browse your products online.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {isEditingProfile ? (
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
                <span className="text-sm font-medium">{STOREFRONT_BASE_URL}/{localStoreSlug}</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} type="button">
                    {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleEditClick} type="button">
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
            <p className="text-sm font-medium py-2">{STOREFRONT_BASE_URL}/{localStoreSlug}</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} type="button">
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="text-base">Enable Online Store</Label>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>When off, your storefront link above is unreachable: customers see a 404 even with the correct URL. Products also need &quot;Show Online&quot; turned on individually in each product&apos;s Additional Details.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-muted-foreground">
            Let customers browse and order from {STOREFRONT_BASE_URL}/{localStoreSlug || "your-store"}
          </p>
        </div>
        {isEditingProfile ? (
          <Switch
            id="online-store-enabled"
            checked={onlineStoreEnabled}
            onCheckedChange={(val) => {
              if (!canUseEcommerce) {
                toast.error(getUpgradeMessage('ecommerce', "Upgrade to a premium plan to enable your online store."));
                return;
              }
              setOnlineStoreEnabled?.(val);
            }}
          />
        ) : (
          <p className="text-sm font-medium py-2">{onlineStoreEnabled ? "Enabled" : "Disabled"}</p>
        )}
      </div>

      {storeType === "pharmacy" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="pcn">PCN License Number</Label>
            {isEditingProfile ? (
              <Input
                id="pcn"
                placeholder="PCN/..."
                value={localPcn}
                onChange={(e) => setLocalPcn(e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium py-2">{localPcn || "Not set"}</p>
            )}
          </div>
          {setShowRetailSuggestions && (
            <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label className="text-base">Include Retail Items in Suggestions</Label>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>When enabled, general retail products (like provisions) will appear alongside products in search suggestions during sales.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-muted-foreground">
                  Show retail items (provisions, cosmetics, etc.) in product suggestions
                </p>
              </div>
              {isEditingProfile ? (
                <Switch
                  id="retail-suggestions"
                  checked={showRetailSuggestions}
                  onCheckedChange={setShowRetailSuggestions}
                />
              ) : (
                <p className="text-sm font-medium py-2">{showRetailSuggestions ? "Enabled" : "Disabled"}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

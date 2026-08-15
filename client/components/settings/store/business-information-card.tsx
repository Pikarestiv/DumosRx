import { Save, Edit2, Copy, Check, Info, Pencil, X, Upload, Lock } from "lucide-react";
import { STOREFRONT_BASE_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { StoreType } from "@/lib/context/store-context";
import { useState } from "react";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BusinessInformationCardProps {
  storeType: StoreType;
  localName: string;
  setLocalName: (val: string) => void;
  localAddress: string;
  setLocalAddress: (val: string) => void;
  localPhone: string;
  setLocalPhone: (val: string) => void;
  localEmail: string;
  setLocalEmail: (val: string) => void;
  localRegistrationNumber: string;
  setLocalRegistrationNumber: (val: string) => void;
  localLogo: string;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveLogo: () => void;
  localStoreSlug?: string;
  setLocalStoreSlug?: (val: string) => void;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
  onlineStoreEnabled?: boolean;
  setOnlineStoreEnabled?: (val: boolean) => void;
  handleSaveProfile: () => void;
}

export function BusinessInformationCard({
  storeType,
  localName,
  setLocalName,
  localAddress,
  setLocalAddress,
  localPhone,
  setLocalPhone,
  localEmail,
  setLocalEmail,
  localRegistrationNumber,
  setLocalRegistrationNumber,
  localLogo,
  handleLogoUpload,
  handleRemoveLogo,
  localStoreSlug,
  setLocalStoreSlug,
  localPcn,
  setLocalPcn,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
  onlineStoreEnabled = false,
  setOnlineStoreEnabled,
  handleSaveProfile,
}: BusinessInformationCardProps) {
  const { canUseEcommerce, canCustomizeTheme, withRestriction, getUpgradeMessage } = useFeatureGate();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Business Information</CardTitle>
          <CardDescription>
            Your business identity — shown on receipts, reports, and your public storefront.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditingProfile(!isEditingProfile)}
        >
          {isEditingProfile ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="store-name">Business Name</Label>
            {isEditingProfile ? (
              <Input
                id="store-name"
                placeholder="e.g. My Business"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium py-2">{localName || "Not set"}</p>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="registration-number">Business Registration / CAC Number</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Your business's official registration number (e.g. CAC in Nigeria). Not the same as a per-product regulatory number like NAFDAC.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {isEditingProfile ? (
              <Input
                id="registration-number"
                placeholder="e.g. RC1234567"
                value={localRegistrationNumber}
                onChange={(e) => setLocalRegistrationNumber(e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium py-2">{localRegistrationNumber || "Not set"}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Address</Label>
            {isEditingProfile ? (
              <Input
                id="address"
                placeholder="123 Health Avenue, Lagos"
                value={localAddress}
                onChange={(e) => setLocalAddress(e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium py-2">{localAddress || "Not set"}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              {isEditingProfile ? (
                <Input
                  id="phone"
                  placeholder="+234..."
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value)}
                />
              ) : (
                <p className="text-sm font-medium py-2">{localPhone || "Not set"}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              {isEditingProfile ? (
                <Input
                  id="email"
                  placeholder="contact@example.com"
                  value={localEmail}
                  onChange={(e) => setLocalEmail(e.target.value)}
                />
              ) : (
                <p className="text-sm font-medium py-2">{localEmail || "Not set"}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Business Logo</Label>
            <p className="text-[0.8rem] text-muted-foreground -mt-1">
              Shown on receipts and your public storefront (if enabled below).
            </p>
            <div className="flex items-center gap-4">
              {localLogo ? (
                <div className="relative group">
                  <img
                    src={localLogo}
                    alt="Logo Preview"
                    className="h-20 w-20 object-contain border rounded-lg p-1 bg-white"
                  />
                  {isEditingProfile && (
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 cursor-pointer" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-20 w-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground bg-muted/30">
                  <Upload className="h-6 w-6" />
                </div>
              )}
              {isEditingProfile && (
                <div className="flex-1">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-block">
                          <Label
                            htmlFor={canCustomizeTheme ? "business-logo-upload" : undefined}
                            className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 ${!canCustomizeTheme ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {!canCustomizeTheme && <Lock className="h-3 w-3 mr-2" />}
                            {localLogo ? "Change Logo" : "Upload Logo"}
                          </Label>
                        </div>
                      </TooltipTrigger>
                      {!canCustomizeTheme && (
                        <TooltipContent>
                          <p>{getUpgradeMessage("custom_branding")}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <input
                    id="business-logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!canCustomizeTheme}
                    onChange={handleLogoUpload}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    SVG, PNG or JPG (Max 1MB)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Store Profile — the parts of Business Information that are specific to
            this store's storefront presence, kept visually nested since a business
            may eventually run more than one store under the same identity above. */}
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
                      <p>When off, your storefront link above is unreachable — customers see a 404 even with the correct URL. Products also need &quot;Show Online&quot; turned on individually in each product&apos;s Additional Details.</p>
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
      </CardContent>
      {isEditingProfile && (
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={() => {
            withRestriction(handleSaveProfile)();
            setIsEditingProfile(false);
          }} className="cursor-pointer">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

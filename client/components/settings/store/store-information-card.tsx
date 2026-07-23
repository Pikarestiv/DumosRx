import { Save, Edit2, Copy, Check, Info, Pencil, X } from "lucide-react";
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

interface StoreInformationCardProps {
  storeType: StoreType;
  localName: string;
  setLocalName: (val: string) => void;
  localAddress: string;
  setLocalAddress: (val: string) => void;
  localPhone: string;
  setLocalPhone: (val: string) => void;
  localEmail: string;
  setLocalEmail: (val: string) => void;
  localStoreSlug?: string;
  setLocalStoreSlug?: (val: string) => void;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
  handleSaveProfile: () => void;
}

export function StoreInformationCard({
  storeType,
  localName,
  setLocalName,
  localAddress,
  setLocalAddress,
  localPhone,
  setLocalPhone,
  localEmail,
  setLocalEmail,
  localStoreSlug,
  setLocalStoreSlug,
  localPcn,
  setLocalPcn,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
  handleSaveProfile,
}: StoreInformationCardProps) {
  const { canUseEcommerce, withRestriction, getUpgradeMessage } = useFeatureGate();
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
          <CardTitle>Store Information</CardTitle>
          <CardDescription>
            These details will appear on printed receipts and reports.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditingProfile(!isEditingProfile)}
        >
          {!!(isEditingProfile) && (
                              <X className="h-4 w-4" />
                            )}
                  {!(isEditingProfile) && (
                              <Pencil className="h-4 w-4" />
                            )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="store-name">Business Name</Label>
          {!!(isEditingProfile) && (
                              <Input
                                id="store-name"
                                placeholder="e.g. My Business"
                                value={localName}
                                onChange={(e) => setLocalName(e.target.value)}
                              />
                            )}
                  {!(isEditingProfile) && (
                              <p className="text-sm font-medium py-2">{localName || "Not set"}</p>
                            )}
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
          {!!(isEditingProfile) && (
                              <>
                                {!!(isEditingSlug) && (
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
                                                          )}
                          {!(isEditingSlug) && (
                                                            <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                                                              <span className="text-sm font-medium">{STOREFRONT_BASE_URL}/{localStoreSlug}</span>
                                                              <div className="flex items-center gap-2">
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} type="button">
                                                                  {!!(copied) && <Check className="h-3 w-3 text-green-500" />}
                                          {!(copied) && <Copy className="h-3 w-3" />}
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
                            )}
                  {!(isEditingProfile) && (
                               <div className="flex items-center gap-2">
                                 <p className="text-sm font-medium py-2">{STOREFRONT_BASE_URL}/{localStoreSlug}</p>
                                 <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} type="button">
                                   {!!(copied) && <Check className="h-3 w-3 text-green-500" />}
                              {!(copied) && <Copy className="h-3 w-3" />}
                                 </Button>
                               </div>
                            )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="address">Address</Label>
          {!!(isEditingProfile) && (
                              <Input
                                id="address"
                                placeholder="123 Health Avenue, Lagos"
                                value={localAddress}
                                onChange={(e) => setLocalAddress(e.target.value)}
                              />
                            )}
                  {!(isEditingProfile) && (
                              <p className="text-sm font-medium py-2">{localAddress || "Not set"}</p>
                            )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            {!!(isEditingProfile) && (
                                    <Input
                                      id="phone"
                                      placeholder="+234..."
                                      value={localPhone}
                                      onChange={(e) => setLocalPhone(e.target.value)}
                                    />
                                  )}
                      {!(isEditingProfile) && (
                                    <p className="text-sm font-medium py-2">{localPhone || "Not set"}</p>
                                  )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            {!!(isEditingProfile) && (
                                    <Input
                                      id="email"
                                      placeholder="contact@example.com"
                                      value={localEmail}
                                      onChange={(e) => setLocalEmail(e.target.value)}
                                    />
                                  )}
                      {!(isEditingProfile) && (
                                    <p className="text-sm font-medium py-2">{localEmail || "Not set"}</p>
                                  )}
          </div>
        </div>
        {storeType === "pharmacy" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="pcn">PCN License Number</Label>
              {!!(isEditingProfile) && (
                                          <Input
                                            id="pcn"
                                            placeholder="PCN/..."
                                            value={localPcn}
                                            onChange={(e) => setLocalPcn(e.target.value)}
                                          />
                                        )}
                          {!(isEditingProfile) && (
                                          <p className="text-sm font-medium py-2">{localPcn || "Not set"}</p>
                                        )}
            </div>
            {setShowRetailSuggestions && (
              <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
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
                {!!(isEditingProfile) && (
                                                <Switch
                                                  id="retail-suggestions"
                                                  checked={showRetailSuggestions}
                                                  onCheckedChange={setShowRetailSuggestions}
                                                />
                                              )}
                              {!(isEditingProfile) && (
                                                <p className="text-sm font-medium py-2">{!!(showRetailSuggestions) && "Enabled"}
                                  {!(showRetailSuggestions) && "Disabled"}</p>
                                              )}
              </div>
            )}
          </>
        )}
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

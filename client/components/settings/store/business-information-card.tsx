import { Save, Info, Pencil, X, Upload, Lock } from "lucide-react";
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
import { StoreType } from "@/lib/context/store-context";
import { useState } from "react";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StoreProfileSection } from "./store-profile-section";

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Business Information</CardTitle>
          <CardDescription>
            Your business identity, shown on receipts, reports, and your public storefront.
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

        <StoreProfileSection
          storeType={storeType}
          isEditingProfile={isEditingProfile}
          localStoreSlug={localStoreSlug}
          setLocalStoreSlug={setLocalStoreSlug}
          localPcn={localPcn}
          setLocalPcn={setLocalPcn}
          showRetailSuggestions={showRetailSuggestions}
          setShowRetailSuggestions={setShowRetailSuggestions}
          onlineStoreEnabled={onlineStoreEnabled}
          setOnlineStoreEnabled={setOnlineStoreEnabled}
          canUseEcommerce={canUseEcommerce}
          getUpgradeMessage={getUpgradeMessage}
        />
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

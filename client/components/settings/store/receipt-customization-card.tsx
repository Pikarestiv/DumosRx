import { Save, ImageOff, X, HelpCircle, Pencil } from "lucide-react";
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
import { ReceiptPreview } from "./receipt-preview";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useReceiptPaperSize } from "@/lib/hooks/use-receipt-paper-size";
import { toast } from "sonner";
import { useState } from "react";

/** A simple label/description + switch row, shown as read-only
 * Enabled/Disabled text outside edit mode. Shared by the receipt toggles
 * that don't need feature-gating (Show Phone, Show Address) - Show Logo and
 * Hide Powered By stay inline since they each wrap their switch in
 * withRestriction()/a tooltip. */
function ReceiptToggleRow({
  label,
  description,
  isEditing,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  isEditing: boolean;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <Label className="text-base">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {isEditing ? (
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      ) : (
        <p className="text-sm font-medium">
          {checked ? "Enabled" : "Disabled"}
        </p>
      )}
    </div>
  );
}

interface ReceiptCustomizationCardProps {
  localName: string;
  localAddress: string;
  localPhone: string;
  localLogo: string;
  localReceiptHeader: string;
  setLocalReceiptHeader: (val: string) => void;
  localReceiptFooter: string;
  setLocalReceiptFooter: (val: string) => void;
  localReceiptTagline: string;
  setLocalReceiptTagline: (val: string) => void;
  showLogo: boolean;
  setShowLogo: (val: boolean) => void;
  logoPosition: "above" | "beside";
  setLogoPosition: (val: "above" | "beside") => void;
  showPhone: boolean;
  setShowPhone: (val: boolean) => void;
  showAddress: boolean;
  setShowAddress: (val: boolean) => void;
  hidePoweredBy: boolean;
  setHidePoweredBy: (val: boolean) => void;
  handleSaveReceiptSettings: () => void;
}

export function ReceiptCustomizationCard({
  localName,
  localAddress,
  localPhone,
  localLogo,
  localReceiptHeader,
  setLocalReceiptHeader,
  localReceiptFooter,
  setLocalReceiptFooter,
  localReceiptTagline,
  setLocalReceiptTagline,
  showLogo,
  setShowLogo,
  logoPosition,
  setLogoPosition,
  showPhone,
  setShowPhone,
  showAddress,
  setShowAddress,
  hidePoweredBy,
  setHidePoweredBy,
  handleSaveReceiptSettings,
}: ReceiptCustomizationCardProps) {
  const {
    canCustomizeTheme,
    canRemoveBranding,
    withRestriction,
    getUpgradeMessage,
  } = useFeatureGate();
  const [isEditing, setIsEditing] = useState(false);
  const { paperSize, setPaperSize } = useReceiptPaperSize();

  const handleToggleLogo = (checked: boolean) => {
    if (checked && !localLogo) {
      toast.info("Please upload a store logo first.");
    }
    setShowLogo(checked);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Receipt Customization</CardTitle>
          <CardDescription>
            Configure how your printed receipts look.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(!isEditing)}
        >
          {!!isEditing && <X className="h-4 w-4" />}
          {!isEditing && <Pencil className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Printer Paper Size</Label>
            <p className="text-sm text-muted-foreground">
              This device only: a receipt printer is a property of this
              terminal, not your account.
            </p>
          </div>
          <Select value={paperSize} onValueChange={setPaperSize}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thermal">Thermal (80mm)</SelectItem>
              <SelectItem value="a4">A4 / Standard paper</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="space-y-3">
              <Label>Store Logo</Label>
              <div className="flex items-center gap-4">
                {localLogo ? (
                  <img
                    src={localLogo}
                    alt="Logo Preview"
                    className="h-20 w-20 object-contain border rounded-lg p-1 bg-white"
                  />
                ) : (
                  // Never a click target on this card (the upload lives on
                  // Business Information) - plain, not dashed, so it doesn't
                  // read as an upload dropzone here.
                  <div className="h-20 w-20 border rounded-lg flex items-center justify-center text-muted-foreground bg-muted/30">
                    <ImageOff className="h-6 w-6" />
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Managed under Business Information above.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="receipt-tagline">
                  Tagline (Optional)
                </Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        A line printed under your business name, like a
                        slogan or what you sell (e.g. "Your trusted
                        neighborhood pharmacy").
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {!!isEditing && (
                <Input
                  id="receipt-tagline"
                  placeholder="e.g. Your trusted neighborhood pharmacy"
                  value={localReceiptTagline}
                  onChange={(e) => setLocalReceiptTagline(e.target.value)}
                />
              )}
              {!isEditing && (
                <p className="text-sm font-medium py-2">
                  {localReceiptTagline || "Not set"}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="receipt-header">
                  Footer Message 1 (Optional)
                </Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Add custom text like your Tax Identification Number,
                        return policy, or a 'Thank You' message to print on all
                        receipts.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {!!isEditing && (
                <Input
                  id="receipt-header"
                  placeholder="e.g. Thanks for your patronage!"
                  value={localReceiptHeader}
                  onChange={(e) => setLocalReceiptHeader(e.target.value)}
                />
              )}
              {!isEditing && (
                <p className="text-sm font-medium py-2">
                  {localReceiptHeader || "Not set"}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="receipt-footer">Footer Message 2</Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Add a footer message to print at the bottom of all
                        receipts.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {!!isEditing && (
                <Input
                  id="receipt-footer"
                  placeholder="e.g. No refund after 24 hours"
                  value={localReceiptFooter}
                  onChange={(e) => setLocalReceiptFooter(e.target.value)}
                />
              )}
              {!isEditing && (
                <p className="text-sm font-medium py-2">
                  {localReceiptFooter || "Not set"}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Show Logo on Receipt</Label>
                <p className="text-sm text-muted-foreground">
                  Display store logo at the top
                </p>
              </div>
              {!!isEditing && (
                <Switch
                  checked={showLogo && canCustomizeTheme}
                  onCheckedChange={(checked) =>
                    checked
                      ? withRestriction(() => handleToggleLogo(checked), {
                          featureAllowed: canCustomizeTheme,
                          featureKey: "custom_branding",
                        })()
                      : withRestriction(() => handleToggleLogo(checked))()
                  }
                />
              )}
              {!isEditing && (
                <p className="text-sm font-medium">
                  {!!(showLogo && canCustomizeTheme) && "Enabled"}
                  {!(showLogo && canCustomizeTheme) && "Disabled"}
                </p>
              )}
            </div>
            {!!(showLogo && canCustomizeTheme) && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Logo Position</Label>
                  <p className="text-sm text-muted-foreground">
                    Above the store name, or beside it
                  </p>
                </div>
                {!!isEditing && (
                  <Select
                    value={logoPosition}
                    onValueChange={(val) =>
                      setLogoPosition(val as "above" | "beside")
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">Above</SelectItem>
                      <SelectItem value="beside">Beside</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {!isEditing && (
                  <p className="text-sm font-medium capitalize">
                    {logoPosition}
                  </p>
                )}
              </div>
            )}
            <ReceiptToggleRow
              label="Show Phone"
              description="Include phone number on receipt"
              isEditing={isEditing}
              checked={showPhone}
              onCheckedChange={setShowPhone}
            />
            <ReceiptToggleRow
              label="Show Address"
              description="Include store address on receipt"
              isEditing={isEditing}
              checked={showAddress}
              onCheckedChange={setShowAddress}
            />
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">
                  Hide "Powered by dumosrx.com"
                </Label>
                <p className="text-sm text-muted-foreground">
                  Remove the DumosRx branding line from printed receipts
                </p>
              </div>
              {isEditing && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Switch
                          checked={hidePoweredBy && canRemoveBranding}
                          disabled={!canRemoveBranding}
                          onCheckedChange={(checked) =>
                            withRestriction(() => setHidePoweredBy(checked), {
                              featureAllowed: canRemoveBranding,
                              featureKey: "remove_branding",
                            })()
                          }
                        />
                      </div>
                    </TooltipTrigger>
                    {!canRemoveBranding && (
                      <TooltipContent>
                        <p>{getUpgradeMessage("remove_branding")}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
              {!isEditing && (
                <p className="text-sm font-medium">
                  {hidePoweredBy && canRemoveBranding ? "Hidden" : "Shown"}
                </p>
              )}
            </div>
          </div>

          <ReceiptPreview
            localName={localName}
            localAddress={localAddress}
            localPhone={localPhone}
            localLogo={localLogo}
            localReceiptHeader={localReceiptHeader}
            localReceiptFooter={localReceiptFooter}
            localReceiptTagline={localReceiptTagline}
            showLogo={showLogo && canCustomizeTheme}
            logoPosition={logoPosition}
            showPhone={showPhone}
            showAddress={showAddress}
            hidePoweredBy={hidePoweredBy && canRemoveBranding}
          />
        </div>
      </CardContent>
      {isEditing && (
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={() => {
              handleSaveReceiptSettings();
              setIsEditing(false);
            }}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Receipt Settings
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

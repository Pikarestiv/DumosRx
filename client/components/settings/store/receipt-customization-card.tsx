import { Save, Upload, X, Info, Pencil } from "lucide-react";
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

interface ReceiptCustomizationCardProps {
  localName: string;
  localAddress: string;
  localPhone: string;
  localLogo: string;
  localReceiptHeader: string;
  setLocalReceiptHeader: (val: string) => void;
  localReceiptFooter: string;
  setLocalReceiptFooter: (val: string) => void;
  showLogo: boolean;
  setShowLogo: (val: boolean) => void;
  showContact: boolean;
  setShowContact: (val: boolean) => void;
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
  showLogo,
  setShowLogo,
  showContact,
  setShowContact,
  hidePoweredBy,
  setHidePoweredBy,
  handleSaveReceiptSettings,
}: ReceiptCustomizationCardProps) {
  const { canCustomizeTheme, canRemoveBranding, withRestriction, getUpgradeMessage } = useFeatureGate();
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
          {!!(isEditing) && <X className="h-4 w-4" />}
                  {!(isEditing) && <Pencil className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">Printer Paper Size</Label>
            <p className="text-sm text-muted-foreground">
              This device only — a receipt printer is a property of this
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
                  <div className="h-20 w-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground bg-muted/30">
                    <Upload className="h-6 w-6" />
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Managed under Business Information above.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="receipt-header">
                  Footer Message 1 (Optional)
                </Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
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
              {!!(isEditing) && (
                                          <Input
                                            id="receipt-header"
                                            placeholder="e.g. Thanks for your patronage!"
                                            value={localReceiptHeader}
                                            onChange={(e) => setLocalReceiptHeader(e.target.value)}
                                          />
                                        )}
                          {!(isEditing) && (
                                          <p className="text-sm font-medium py-2">{localReceiptHeader || "Not set"}</p>
                                        )}
            </div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="receipt-footer">Footer Message 2</Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
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
              {!!(isEditing) && (
                                          <Input
                                            id="receipt-footer"
                                            placeholder="e.g. No refund after 24 hours"
                                            value={localReceiptFooter}
                                            onChange={(e) => setLocalReceiptFooter(e.target.value)}
                                          />
                                        )}
                          {!(isEditing) && (
                                          <p className="text-sm font-medium py-2">{localReceiptFooter || "Not set"}</p>
                                        )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Show Logo on Receipt</Label>
                <p className="text-sm text-muted-foreground">
                  Display store logo at the top
                </p>
              </div>
              {!!(isEditing) && (
                                          <Switch
                                            checked={showLogo && canCustomizeTheme}
                                            onCheckedChange={(checked) => checked ? withRestriction(() => handleToggleLogo(checked), { featureAllowed: canCustomizeTheme, featureKey: 'custom_branding' })() : withRestriction(() => handleToggleLogo(checked))()}
                                          />
                                        )}
                          {!(isEditing) && (
                                          <p className="text-sm font-medium">{!!((showLogo && canCustomizeTheme)) && "Enabled"}
                              {!((showLogo && canCustomizeTheme)) && "Disabled"}</p>
                                        )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Show Phone & Address</Label>
                <p className="text-sm text-muted-foreground">
                  Include contact details on receipt
                </p>
              </div>
              {!!(isEditing) && (
                                          <Switch checked={showContact} onCheckedChange={setShowContact} />
                                        )}
                          {!(isEditing) && (
                                          <p className="text-sm font-medium">{!!(showContact) && "Enabled"}
                              {!(showContact) && "Disabled"}</p>
                                        )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Hide "Powered by dumosrx.com"</Label>
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
            showLogo={showLogo && canCustomizeTheme}
            showContact={showContact}
            hidePoweredBy={hidePoweredBy && canRemoveBranding}
          />
        </div>
      </CardContent>
      {isEditing && (
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={() => {
            handleSaveReceiptSettings();
            setIsEditing(false);
          }} className="cursor-pointer">
            <Save className="w-4 h-4 mr-2" />
            Save Receipt Settings
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

import { Save, Upload, X, Info, Lock, Pencil } from "lucide-react";
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
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { toast } from "sonner";
import { useState } from "react";

interface ReceiptCustomizationCardProps {
  localName: string;
  localAddress: string;
  localPhone: string;
  localLogo: string;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveLogo: () => void;
  localReceiptHeader: string;
  setLocalReceiptHeader: (val: string) => void;
  localReceiptFooter: string;
  setLocalReceiptFooter: (val: string) => void;
  showLogo: boolean;
  setShowLogo: (val: boolean) => void;
  showContact: boolean;
  setShowContact: (val: boolean) => void;
  handleSaveReceiptSettings: () => void;
}

export function ReceiptCustomizationCard({
  localName,
  localAddress,
  localPhone,
  localLogo,
  handleLogoUpload,
  handleRemoveLogo,
  localReceiptHeader,
  setLocalReceiptHeader,
  localReceiptFooter,
  setLocalReceiptFooter,
  showLogo,
  setShowLogo,
  showContact,
  setShowContact,
  handleSaveReceiptSettings,
}: ReceiptCustomizationCardProps) {
  const { canCustomizeTheme, withRestriction, getUpgradeMessage } = useFeatureGate();
  const [isEditing, setIsEditing] = useState(false);

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
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="space-y-3">
              <Label>Store Logo</Label>
              <div className="flex items-center gap-4">
                {!!(localLogo) && (
                                                <div className="relative group">
                                                  <img
                                                    src={localLogo}
                                                    alt="Logo Preview"
                                                    className="h-20 w-20 object-contain border rounded-lg p-1 bg-white"
                                                  />
                                                  {isEditing && (
                                                    <button
                                                      onClick={handleRemoveLogo}
                                                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                      <X className="h-3 w-3 cursor-pointer" />
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                              {!(localLogo) && (
                                                <div className="h-20 w-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground bg-muted/30">
                                                  <Upload className="h-6 w-6" />
                                                </div>
                                              )}
                {isEditing && (
                  <div className="flex-1">
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-block">
                            <Label
                              htmlFor={
                                canCustomizeTheme ? "logo-upload" : undefined
                              }
                              className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 ${!canCustomizeTheme ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {!canCustomizeTheme && (
                                <Lock className="h-3 w-3 mr-2" />
                              )}
                              {!!(localLogo) && "Change Logo"}
                                                          {!(localLogo) && "Upload Logo"}
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
                      id="logo-upload"
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

"use client";

import { Pill, ShoppingBasket, ShoppingCart, Check, Save, Upload, X } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { StoreType } from "@/lib/context/store-context";
import { DevSeedButton } from "@/components/dev/seed-button";

interface StoreSettingsProps {
  storeType: StoreType;
  handleSwitchVertical: (type: StoreType) => void;
  localName: string;
  setLocalName: (val: string) => void;
  localAddress: string;
  setLocalAddress: (val: string) => void;
  localPhone: string;
  setLocalPhone: (val: string) => void;
  localEmail: string;
  setLocalEmail: (val: string) => void;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  handleSaveProfile: () => void;
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
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
}

export function StoreSettings({
  storeType,
  handleSwitchVertical,
  localName,
  setLocalName,
  localAddress,
  setLocalAddress,
  localPhone,
  setLocalPhone,
  localEmail,
  setLocalEmail,
  localPcn,
  setLocalPcn,
  handleSaveProfile,
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
  showRetailSuggestions = false,
  setShowRetailSuggestions,
}: StoreSettingsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business Vertical</CardTitle>
          <CardDescription>
            Switching modes changes the terminology and active modules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { id: "pharmacy", label: "Pharmacy", icon: Pill },
              { id: "grocery", label: "Grocery", icon: ShoppingBasket },
              {
                id: "supermarket",
                label: "Supermarket",
                icon: ShoppingCart,
              },
              { id: "general", label: "General", icon: Check },
            ].map((vertical) => (
              <button
                key={vertical.id}
                onClick={() =>
                  handleSwitchVertical(vertical.id as StoreType)
                }
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  storeType === vertical.id
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                }`}
              >
                <vertical.icon className="h-6 w-6 mb-2 text-primary" />
                <span className="text-sm font-medium">
                  {vertical.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Store Information</CardTitle>
          <CardDescription>
            These details will appear on printed receipts and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="store-name">Business Name</Label>
            <Input
              id="store-name"
              placeholder="e.g. My Business"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="123 Health Avenue, Lagos"
              value={localAddress}
              onChange={(e) => setLocalAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="+234..."
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="contact@example.com"
                value={localEmail}
                onChange={(e) => setLocalEmail(e.target.value)}
              />
            </div>
          </div>
          {storeType === "pharmacy" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="pcn">PCN License Number</Label>
                <Input
                  id="pcn"
                  placeholder="PCN/..."
                  value={localPcn}
                  onChange={(e) => setLocalPcn(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Include Retail Items in Suggestions</Label>
                  <p className="text-sm text-muted-foreground">
                    Show retail items (provisions, cosmetics, etc.) in product suggestions
                  </p>
                </div>
                <Switch
                  id="retail-suggestions"
                  checked={showRetailSuggestions}
                  onCheckedChange={setShowRetailSuggestions}
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={handleSaveProfile}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt Customization</CardTitle>
          <CardDescription>
            Configure how your printed receipts look.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="space-y-3">
                <Label>Store Logo</Label>
                <div className="flex items-center gap-4">
                  {localLogo ? (
                    <div className="relative group">
                      <img 
                        src={localLogo} 
                        alt="Logo Preview" 
                        className="h-20 w-20 object-contain border rounded-lg p-1 bg-white"
                      />
                      <button 
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-20 w-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground bg-muted/30">
                      <Upload className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Label 
                      htmlFor="logo-upload" 
                      className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                    >
                      {localLogo ? "Change Logo" : "Upload Logo"}
                    </Label>
                    <input 
                      id="logo-upload" 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleLogoUpload}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      SVG, PNG or JPG (Max 1MB)
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="receipt-header">
                  Receipt Header (Optional)
                </Label>
                <Input
                  id="receipt-header"
                  placeholder="e.g. Thanks for your patronage!"
                  value={localReceiptHeader}
                  onChange={(e) => setLocalReceiptHeader(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receipt-footer">Receipt Footer</Label>
                <Input
                  id="receipt-footer"
                  placeholder="e.g. No refund after 24 hours"
                  value={localReceiptFooter}
                  onChange={(e) => setLocalReceiptFooter(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Show Logo on Receipt</Label>
                  <p className="text-sm text-muted-foreground">
                    Display store logo at the top
                  </p>
                </div>
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Show Phone & Address</Label>
                  <p className="text-sm text-muted-foreground">
                    Include contact details on receipt
                  </p>
                </div>
                <Switch
                  checked={showContact}
                  onCheckedChange={setShowContact}
                />
              </div>
            </div>

            {/* Receipt Preview */}
            <div className="w-full md:w-64 flex-shrink-0">
              <Label className="mb-3 block">Live Preview</Label>
              <div className="bg-white text-black p-4 shadow-md rounded-sm border-t-8 border-primary font-mono text-[10px] space-y-2 select-none pointer-events-none">
                <div className="text-center border-b border-black pb-2 mb-2">
                  {showLogo && localLogo && (
                    <img src={localLogo} alt="Store logo" className="h-10 w-10 mx-auto object-contain mb-1" />
                  )}
                  <div className="font-bold text-xs uppercase">{localName || "DUMOSRX PHARMACY"}</div>
                  {showContact && (
                    <div className="text-[8px] leading-tight">
                      {localAddress || "123 Business Road, Nigeria"}<br />
                      {localPhone || "0800-DUMOSRX"}
                    </div>
                  )}
                </div>

                <div className="text-center mb-2">
                  <span className="font-bold uppercase tracking-widest border border-black inline-block px-2 py-0.5 text-[8px]">Invoice</span>
                </div>

                <div className="space-y-0.5 text-[8px] mb-2">
                  <div className="flex justify-between">
                    <span className="font-bold">Invoice no:</span>
                    <span>INV-SAMPLE</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">Customer:</span>
                    <span>Walk-in Customer</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">Date:</span>
                    <span>{new Date().toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                <div className="border-b border-black pb-1 mb-1 text-[8px]">
                  <div className="flex justify-between font-bold mb-1 border-b border-dashed border-black pb-0.5">
                    <span className="flex-1 w-1/2">Product</span>
                    <span className="w-4 text-center">Qty</span>
                    <span className="w-10 text-right">Price</span>
                    <span className="w-12 text-right">Total</span>
                  </div>
                  <div className="flex justify-between mb-0.5 items-start">
                    <span className="flex-1 w-1/2 break-words pr-1 leading-tight">Item Name</span>
                    <span className="w-4 text-center">2</span>
                    <span className="w-10 text-right">2,500</span>
                    <span className="w-12 text-right">5,000</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="flex-1 w-1/2 break-words pr-1 leading-tight">Sample Med</span>
                    <span className="w-4 text-center">1</span>
                    <span className="w-10 text-right">2,500</span>
                    <span className="w-12 text-right">2,500</span>
                  </div>
                </div>

                <div className="space-y-0.5 text-[8px] pb-1 mb-1 border-b border-black">
                  <div className="flex justify-between">
                    <span>Sub total:</span>
                    <span>7,500.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (7.5%):</span>
                    <span>562.50</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 mt-0.5 border-t border-dashed border-black text-[9px]">
                    <span>Total:</span>
                    <span>8,062.50</span>
                  </div>
                </div>

                <div className="space-y-0.5 text-[8px] mb-2">
                  <div className="flex justify-between">
                    <span>Payment type:</span>
                    <span className="font-bold">CASH</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total paid:</span>
                    <span>8,100.00</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Change:</span>
                    <span>37.50</span>
                  </div>
                </div>

                <div className="text-center pt-2 space-y-1 text-[8px]">
                  <div className="text-[10px] tracking-widest font-black opacity-30">||||||||| ||| |||||</div>
                  {localReceiptHeader && <div className="italic">"{localReceiptHeader}"</div>}
                  <div className="mt-1">{localReceiptFooter || "Thank you for your patronage!"}</div>
                  <div className="text-[7px] mt-1 opacity-50">Powered by DumosRx</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={handleSaveReceiptSettings}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Receipt Settings
          </Button>
        </CardFooter>
      </Card>

      {/* Developer Tools */}
      {process.env.NODE_ENV === "development" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Developer Tools</CardTitle>
            <CardDescription>
              Local database management utilities. These are only visible in development mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DevSeedButton />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

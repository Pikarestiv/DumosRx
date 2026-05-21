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
            <div className="grid gap-2">
              <Label htmlFor="pcn">PCN License Number</Label>
              <Input
                id="pcn"
                placeholder="PCN/..."
                value={localPcn}
                onChange={(e) => setLocalPcn(e.target.value)}
              />
            </div>
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
                <div className="text-center space-y-1">
                  {showLogo && localLogo && (
                    <img src={localLogo} alt="Store logo" className="h-10 w-10 mx-auto object-contain mb-1" />
                  )}
                  <div className="font-bold text-xs uppercase">{localName || "DUMOSRX PHARMACY"}</div>
                  {showContact && (
                    <div className="text-[8px] leading-tight">
                      {localAddress || "123 Business Road, Nigeria"}<br />
                      Tel: {localPhone || "0800-DUMOSRX"}
                    </div>
                  )}
                </div>

                <Separator className="bg-black/10 my-2" />
                
                <div className="space-y-1">
                  {localReceiptHeader && <div className="text-center italic mb-2">"{localReceiptHeader}"</div>}
                  <div className="flex justify-between">
                    <span>Item Name x2</span>
                    <span>#5,000.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sample Medicine x1</span>
                    <span>#2,500.00</span>
                  </div>
                </div>

                <Separator className="bg-black/10 my-2 border-dashed" />

                <div className="space-y-0.5 font-bold">
                  <div className="flex justify-between">
                    <span>SUBTOTAL</span>
                    <span>#7,500.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (7.5%)</span>
                    <span>#562.50</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-black/20 pt-1 mt-1">
                    <span>TOTAL</span>
                    <span>#8,062.50</span>
                  </div>
                </div>

                <div className="text-center pt-4 space-y-1">
                  <div className="text-[8px]">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</div>
                  {localReceiptFooter && <div className="mt-2">{localReceiptFooter}</div>}
                  <div className="text-[7px] mt-2 opacity-50">Powered by DumosRx</div>
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
    </div>
  );
}

import { Save, Edit2, Copy, Check } from "lucide-react";
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
  const { canUseEcommerce } = useFeatureGate();
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`dumosrx.com/s/${localStoreSlug}`);
    setCopied(true);
    toast.success("Store link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditClick = () => {
    if (!canUseEcommerce) {
      toast.error("Upgrade to a premium plan to customize your storefront URL.");
      return;
    }
    setIsEditingSlug(true);
  };

  return (
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
          <Label htmlFor="store-slug">Store URL Slug</Label>
          {isEditingSlug ? (
            <div className="flex rounded-md shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                dumosrx.com/s/
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
              <span className="text-sm font-medium">dumosrx.com/s/{localStoreSlug}</span>
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
            {setShowRetailSuggestions && (
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
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSaveProfile} className="cursor-pointer">
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
}

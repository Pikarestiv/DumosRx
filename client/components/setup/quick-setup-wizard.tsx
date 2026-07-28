"use client";

import { useRecordCounts } from "@/lib/hooks/use-setup-data";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useStore, StoreType } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { ShoppingBasket, Pill, Store, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";

export function QuickSetupWizard() {
  const {
    isInitialized,
    updateStoreProfile,
    loading: storeLoading,
    storeProfile,
  } = useStore();
  const { isAuthenticated, isAdmin, isCloudLinked } = useAuth();
  const { data: recordCounts, isLoading: dataLoading } = useRecordCounts();
  const pathname = usePathname();

  const [step, setStep] = useState(1);
  const [storeType, setStoreType] = useState<StoreType>("pharmacy");
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [showRetailSuggestions, setShowRetailSuggestions] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (storeProfile) {
      if (storeProfile.store_type) setStoreType(storeProfile.store_type);
      if (storeProfile.name) setStoreName(storeProfile.name);
      if (storeProfile.location) setLocation(storeProfile.location);
      if (storeProfile.address) setAddress(storeProfile.address);
      if (storeProfile.phone) setPhone(storeProfile.phone);
      if (storeProfile.show_retail_suggestions !== undefined) {
        setShowRetailSuggestions(storeProfile.show_retail_suggestions === 1);
      }
    }
  }, [storeProfile]);

  const handleComplete = () => {
    if (!storeName) {
      toast.error("Please enter a store name");
      return;
    }

    updateStoreProfile({
      store_type: storeType,
      name: storeName,
      location,
      address,
      phone,
      store_slug:
        storeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "") +
        "-" +
        Math.random().toString(36).substring(2, 6),
      show_retail_suggestions: showRetailSuggestions ? 1 : 0,
      is_initialized: 1,
      updated_at: new Date().toISOString(),
    });

    toast.success(`Welcome to ${APP_NAME}! Setup complete.`);
  };

  if (storeLoading || dataLoading) return null;

  const totalRecords = recordCounts || 0;

  const publicRoutes = ["/", "/login", "/setup", "/register"];
  if (
    publicRoutes.includes(pathname) ||
    isInitialized ||
    !isAuthenticated ||
    !isAdmin ||
    isCloudLinked ||
    totalRecords > 0
  )
    return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      title={<>Welcome to {APP_NAME}</>}
      description={<>Let&apos;s customize the platform for your business.</>}
      className="sm:max-w-[500px] border-accent/20 dark:border-white/20"
      footer={
        <DialogFooter className="flex sm:justify-between items-center">
          <div className="flex gap-1">
            {[1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full transition-all ${step === i ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 2 && (
              <Button onClick={() => setStep(step + 1)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {!(step < 2) && (
              <Button
                onClick={handleComplete}
                className="bg-accent hover:bg-accent/90"
              >
                Finish Setup
              </Button>
            )}
          </div>
        </DialogFooter>
      }
    >
      <div className="py-6">
        {step === 1 && (
          <div className="space-y-4">
            <Label className="text-center block mb-4">
              Choose your business type
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <Card
                className={`cursor-pointer transition-all border-2 ${storeType === "pharmacy" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onClick={() => setStoreType("pharmacy")}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Pill className="h-8 w-8 text-primary" />
                  <span className="font-semibold">Pharmacy</span>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${storeType === "grocery" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onClick={() => setStoreType("grocery")}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <ShoppingBasket className="h-8 w-8 text-primary" />
                  <span className="font-semibold">Grocery / Retail</span>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${storeType === "supermarket" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onClick={() => setStoreType("supermarket")}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Store className="h-8 w-8 text-primary" />
                  <span className="font-semibold">Supermarket</span>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${storeType === "retail" ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onClick={() => setStoreType("retail")}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Check className="h-8 w-8 text-primary" />
                  <span className="font-semibold">General Retail</span>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store Name</Label>
              <Input
                id="store-name"
                placeholder={
                  storeType === "pharmacy"
                    ? "e.g. HealthFirst Pharmacy"
                    : "e.g. Green Groceries"
                }
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">City / State</Label>
                <Input
                  id="location"
                  placeholder="e.g. Ikeja, Lagos"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Contact Phone</Label>
                <Input
                  id="phone"
                  placeholder="+234..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Physical Address</Label>
              <Input
                id="address"
                placeholder="123 Main Street..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            {storeType === "pharmacy" && (
              <div className="flex items-center justify-between rounded-lg border p-4 mt-2">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">
                    Include Retail Suggestions
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show retail items (e.g. provisions, cosmetics) alongside
                    product suggestions
                  </p>
                </div>
                <Switch
                  id="retail-suggestions-onboarding"
                  checked={showRetailSuggestions}
                  onCheckedChange={setShowRetailSuggestions}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

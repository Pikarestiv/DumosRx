"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useStore, StoreType } from "@/lib/context/store-context";
import { ShoppingBasket, Pill, Store, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";

export function QuickSetupWizard() {
  const { isInitialized, updateStoreProfile } = useStore();
  const [step, setStep] = useState(1);
  const [storeType, setStoreType] = useState<StoreType>("pharmacy");
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [open, setOpen] = useState(true);

  const handleComplete = () => {
    if (!storeName) {
      toast.error("Please enter a store name");
      return;
    }

    updateStoreProfile({
      store_type: storeType,
      name: storeName,
      address: location,
      is_initialized: 1,
      updated_at: new Date().toISOString(),
    });

    toast.success(`Welcome to ${APP_NAME}! Setup complete.`);
  };

  if (isInitialized) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px] border-accent/20 dark:border-white/20">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-bold text-center">
            Welcome to {APP_NAME}
          </DialogTitle>
          <DialogDescription className="text-center">
            Let's customize the platform for your business.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {step === 1 && (
            <div className="space-y-4">
              <Label className="text-center block mb-4">Choose your business type</Label>
              <div className="grid grid-cols-2 gap-4">
                <Card 
                  className={`cursor-pointer transition-all border-2 ${storeType === 'pharmacy' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                  onClick={() => setStoreType('pharmacy')}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <Pill className="h-8 w-8 text-primary" />
                    <span className="font-semibold">Pharmacy</span>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all border-2 ${storeType === 'grocery' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                  onClick={() => setStoreType('grocery')}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <ShoppingBasket className="h-8 w-8 text-primary" />
                    <span className="font-semibold">Grocery / Retail</span>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all border-2 ${storeType === 'supermarket' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                  onClick={() => setStoreType('supermarket')}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <Store className="h-8 w-8 text-primary" />
                    <span className="font-semibold">Supermarket</span>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all border-2 ${storeType === 'general' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                  onClick={() => setStoreType('general')}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <Check className="h-8 w-8 text-primary" />
                    <span className="font-semibold">General Store</span>
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
                  placeholder={storeType === 'pharmacy' ? "e.g. HealthFirst Pharmacy" : "e.g. Green Groceries"} 
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location (City/State)</Label>
                <Input 
                  id="location" 
                  placeholder="e.g. Ikeja, Lagos" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center">
          <div className="flex gap-1">
            {[1, 2].map((i) => (
              <div 
                key={i} 
                className={`h-1.5 w-8 rounded-full transition-all ${step === i ? 'bg-primary' : 'bg-muted'}`} 
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} className="bg-accent hover:bg-accent/90">
                Finish Setup
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

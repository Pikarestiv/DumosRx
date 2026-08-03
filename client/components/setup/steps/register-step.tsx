"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import type { StoreOption } from "@/lib/types/store";

interface RegisterStepProps {
  onRegister: (firstName: string, lastName: string, username: string, pin: string, storeName: string, existingStoreId?: string) => Promise<void>;
  isLoading: boolean;
  isCloudLinked?: boolean;
  existingStores?: StoreOption[];
}

export function RegisterStep({ onRegister, isLoading, isCloudLinked, existingStores = [] }: RegisterStepProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [storeName, setStoreName] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("new");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister(
      firstName.trim(),
      lastName.trim(),
      username.trim().toLowerCase(),
      pin,
      storeName.trim(),
      selectedStoreId === "new" ? undefined : selectedStoreId
    );
  };

  return (
    <motion.div
      key="register"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col w-full"
    >
      <Card className="flex-1 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border shadow-[0_-20px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl bg-background sm:bg-card/60 sm:backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-xl overflow-hidden relative">
        <CardHeader className="space-y-1 flex flex-col items-center text-center pb-1 pt-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">
            {!!(isCloudLinked) && "Cloud Setup"}
                      {!(isCloudLinked) && "New Administrator"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs">
            {!!(isCloudLinked) && "Account linked! Now create your local master login."}
                      {!(isCloudLinked) && "Create your master local account"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-2.5 pt-3 pb-3">
            {existingStores.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="store-select" className="text-xs">Assign to Shop</Label>
                <select 
                  id="store-select"
                  className="w-full h-10 bg-background/50 border border-input rounded-md px-3 text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
                  value={selectedStoreId}
                  onChange={(e) => {
                    setSelectedStoreId(e.target.value);
                    if (e.target.value !== "new") {
                      const store = existingStores.find(s => s.id === e.target.value);
                      setStoreName(store?.name || "");
                    } else {
                      setStoreName("");
                    }
                  }}
                >
                  <option value="new">+ Create New Shop Profile</option>
                  {existingStores.map(store => (
                    <option key={store.id} value={store.id}>Use Existing: {store.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="store-name" className="text-xs">
                {selectedStoreId === "new" && "New Store / Store Name"}
                              {!(selectedStoreId === "new") && "Shop Name (Selected)"}
              </Label>
              <Input
                id="store-name"
                placeholder="e.g. Dumos Health Store"
                className="bg-background/50 font-bold border-primary/20 focus:border-primary disabled:opacity-80 h-10"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                disabled={selectedStoreId !== "new"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="first_name" className="text-xs">First Name</Label>
                <Input
                  id="first_name"
                  placeholder="e.g. John"
                  className="bg-background/50 h-10"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="last_name" className="text-xs">Last Name</Label>
                <Input
                  id="last_name"
                  placeholder="e.g. Doe"
                  className="bg-background/50 h-10"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-username" className="text-xs">Username</Label>
              <Input
                id="reg-username"
                placeholder="admin"
                className="bg-background/50 h-10 lowercase"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-pin" className="text-xs">Secure PIN</Label>
              <div className="flex justify-start">
                <InputOTP
                  maxLength={4}
                  value={pin}
                  onChange={(value) => setPin(value)}
                >
                  <InputOTPGroup className="gap-2">
                    <InputOTPSlot index={0} className="w-10 h-10 text-lg font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
                    <InputOTPSlot index={1} className="w-10 h-10 text-lg font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
                    <InputOTPSlot index={2} className="w-10 h-10 text-lg font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
                    <InputOTPSlot index={3} className="w-10 h-10 text-lg font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-3 pb-5">
            <Button
              type="submit"
              className="w-full h-11 text-base font-bold shadow-lg"
              disabled={isLoading}
            >
              {!!(isLoading) && (
                                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        )}
                          {!(isLoading) && (
                                          "Complete Setup"
                                        )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
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
import { UserPlus, Loader2 } from "lucide-react";
import { useState } from "react";

interface RegisterStepProps {
  onRegister: (name: string, username: string, pin: string, storeName: string, existingStoreId?: string) => Promise<void>;
  isLoading: boolean;
  isCloudLinked?: boolean;
  existingStores?: any[];
}

export function RegisterStep({ onRegister, isLoading, isCloudLinked, existingStores = [] }: RegisterStepProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [storeName, setStoreName] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("new");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister(name, username, pin, storeName, selectedStoreId === "new" ? undefined : selectedStoreId);
  };

  return (
    <motion.div
      key="register"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
        <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {isCloudLinked ? "Cloud Setup" : "New Administrator"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isCloudLinked 
              ? "Account linked! Now create your local master login." 
              : "Create your master local account"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            {existingStores.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="store-select">Assign to Shop</Label>
                <select 
                  id="store-select"
                  className="w-full h-11 bg-background/50 border border-input rounded-md px-3 text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
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

            <div className="space-y-2">
              <Label htmlFor="store-name">
                {selectedStoreId === "new" ? "New Pharmacy / Store Name" : "Shop Name (Selected)"}
              </Label>
              <Input
                id="store-name"
                placeholder="e.g. Dumos Health Pharmacy"
                className="bg-background/50 font-bold border-primary/20 focus:border-primary disabled:opacity-80"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                disabled={selectedStoreId !== "new"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Administrator Full Name</Label>
              <Input
                id="name"
                placeholder="e.g. John Doe"
                className="bg-background/50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-username">Username</Label>
              <Input
                id="reg-username"
                placeholder="admin"
                className="bg-background/50"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-pin">Secure PIN / Password</Label>
              <Input
                id="reg-pin"
                type="password"
                placeholder="••••"
                className="bg-background/50"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-6 pb-8">
            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                "Complete Setup"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </motion.div>
  );
}

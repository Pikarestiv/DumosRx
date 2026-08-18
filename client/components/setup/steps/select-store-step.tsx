"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store as StoreIcon, Loader2, ArrowLeft } from "lucide-react";
import type { StoreOption } from "@/lib/types/store";

interface SelectStoreStepProps {
  stores: StoreOption[];
  selectedStoreId: string;
  setSelectedStoreId: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  header?: React.ReactNode;
}

export function SelectStoreStep({
  stores,
  selectedStoreId,
  setSelectedStoreId,
  onConfirm,
  onCancel,
  isLoading,
  header,
}: SelectStoreStepProps) {
  return (
    <motion.div
      key="select-store"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col w-full"
    >
      <AuthCardShell variant="page" header={header} padding="py-5" icon={null}>
        <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <StoreIcon className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Select Store</CardTitle>
          <CardDescription className="text-muted-foreground">
            Choose which store layout/data to initialize on this device
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="store-select">Available Locations</Label>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger id="store-select" className="w-full bg-background/50 h-12">
                <SelectValue placeholder="Choose a store..." />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="cursor-pointer">
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-3 pt-6 pb-8">
          <Button
            onClick={onConfirm}
            className="w-full h-12 text-lg font-bold shadow-lg"
            disabled={isLoading || !selectedStoreId}
          >
            {!!(isLoading) && (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                  )}
                      {!(isLoading) && (
                                    "Initialize Selected Store"
                                  )}
          </Button>

          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
            disabled={isLoading}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cloud Login
          </Button>
        </CardFooter>
      </AuthCardShell>
    </motion.div>
  );
}

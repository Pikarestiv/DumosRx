import { useState } from "react";
import { Save, Info, Pencil, X, Banknote, Percent } from "lucide-react";
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
import {
  CURRENCIES,
  getCurrencyByCode,
  DEFAULT_CURRENCY_CODE,
} from "@/lib/constants/currencies";

interface RegionalSettingsCardProps {
  localCurrency: string;
  setLocalCurrency: (val: string) => void;
  localVat: string;
  setLocalVat: (val: string) => void;
  handleSaveRegional: () => void;
}

export function RegionalSettingsCard({
  localCurrency,
  setLocalCurrency,
  localVat,
  setLocalVat,
  handleSaveRegional,
}: RegionalSettingsCardProps) {
  const [isEditingRegional, setIsEditingRegional] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Regional Settings</CardTitle>
          <CardDescription>
            Configure currency and locale defaults.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditingRegional(!isEditingRegional)}
        >
          {!!isEditingRegional && <X className="h-4 w-4" />}
          {!isEditingRegional && <Pencil className="h-4 w-4" />}
        </Button>
      </CardHeader>
      {!isEditingRegional && (
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <Banknote className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Currency</p>
              <p className="text-sm font-semibold">
                {getCurrencyByCode(localCurrency).name} (
                {getCurrencyByCode(localCurrency).symbol})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">VAT Percentage</p>
              <p className="text-sm font-semibold">
                {localVat ? `${localVat}%` : "0%"}
              </p>
            </div>
          </div>
        </CardContent>
      )}
      {isEditingRegional && (
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="currency">Currency</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      The currency used across the app for prices, sales, and
                      reports. Defaults to Nigerian Naira.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={localCurrency || DEFAULT_CURRENCY_CODE}
              onValueChange={setLocalCurrency}
            >
              <SelectTrigger id="currency" className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name} ({c.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="vat">VAT Percentage (%)</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      The default Value Added Tax applied to transactions.
                      Leave as 0 if your prices are already tax-inclusive.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="vat"
              type="number"
              step="0.1"
              value={localVat}
              onChange={(e) => setLocalVat(e.target.value)}
              placeholder="e.g. 7.5"
            />
            <p className="text-xs text-muted-foreground">
              This percentage is added on top of every sale's subtotal at
              checkout; it is not deducted from your product prices. Leave
              this at 0 (the default) if you don't want to charge VAT, or if
              your prices already include it.
            </p>
          </div>
        </CardContent>
      )}
      {isEditingRegional && (
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={() => {
              handleSaveRegional();
              setIsEditingRegional(false);
            }}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Regional Settings
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

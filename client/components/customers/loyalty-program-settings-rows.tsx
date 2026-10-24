"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function HelpHint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LoyaltyProgramStatusRow({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label className="text-base">Program Status</Label>
          <HelpHint text="When off, points stop earning and the Redeem Reward option disappears from POS checkout. Tiers and rewards below stay configured for whenever you turn it back on." />
        </div>
        <p className="text-sm text-muted-foreground">
          Let customers earn and redeem points on purchases
        </p>
      </div>
      <Switch
        id="loyalty-program-enabled-dialog"
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

export function LoyaltyEarnRateRow({
  currencySymbol,
  value,
  onChange,
  onSave,
}: {
  currencySymbol: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4 bg-background gap-4">
      <div className="space-y-0.5 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Label htmlFor="loyalty-earn-rate" className="text-base">Earn Rate</Label>
          <HelpHint text="Applies before any tier bonus - a customer in a 2x tier earns double this rate." />
        </div>
        <p className="text-sm text-muted-foreground">
          Points earned per {currencySymbol}100 spent
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          id="loyalty-earn-rate"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          className="w-20"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

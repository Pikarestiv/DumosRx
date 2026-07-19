import { Save, Info, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PaymentSettingsCardProps {
  requirePaymentAccount: boolean;
  setRequirePaymentAccount: (val: boolean) => void;
  enabledPaymentMethods: string[];
  setEnabledPaymentMethods: (val: string[]) => void;
  handleSaveProfile: () => void;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card / POS" },
  { id: "transfer", label: "Transfer" },
  { id: "credit", label: "Credit (Debt)" },
  { id: "mixed", label: "Mixed Payment" },
];

export function PaymentSettingsCard({
  requirePaymentAccount,
  setRequirePaymentAccount,
  enabledPaymentMethods,
  setEnabledPaymentMethods,
  handleSaveProfile,
}: PaymentSettingsCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const toggleMethod = (id: string, checked: boolean) => {
    if (checked) {
      setEnabledPaymentMethods([...enabledPaymentMethods, id]);
    } else {
      setEnabledPaymentMethods(enabledPaymentMethods.filter((m) => m !== id));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Payment Configuration</CardTitle>
          <CardDescription>
            Configure accepted payment methods and account rules.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold">Enabled Payment Methods</Label>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle which payment methods appear as options on the POS checkout screen.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border rounded-lg p-4">
              {PAYMENT_METHODS.map((method) => (
                <div key={method.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`method-${method.id}`}
                    checked={enabledPaymentMethods.includes(method.id)}
                    onCheckedChange={(checked) => toggleMethod(method.id, checked as boolean)}
                  />
                  <Label
                    htmlFor={`method-${method.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {method.label}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 py-2">
              {enabledPaymentMethods.length > 0 ? (
                enabledPaymentMethods.map(id => {
                  const method = PAYMENT_METHODS.find(m => m.id === id);
                  return (
                    <div key={id} className="px-2.5 py-1 rounded-md bg-muted text-sm font-medium border">
                      {method?.label || id}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground italic">No payment methods enabled.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-4 gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label className="text-base">Require Payment Destination Account</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>When enabled, cashiers must specify exactly which bank account or till the money was paid into during checkout.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              Force cashiers to select which bank/terminal received Transfers or Card payments.
            </p>
          </div>
          {isEditing ? (
            <Switch
              checked={requirePaymentAccount}
              onCheckedChange={setRequirePaymentAccount}
            />
          ) : (
            <p className="text-sm font-medium">{requirePaymentAccount ? "Enabled" : "Disabled"}</p>
          )}
        </div>
      </CardContent>
      {isEditing && (
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={() => {
            handleSaveProfile();
            setIsEditing(false);
          }} className="cursor-pointer">
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

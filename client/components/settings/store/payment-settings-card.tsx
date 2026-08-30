import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/context/store-context";

interface PaymentSettingsCardProps {
  requirePaymentAccount: boolean;
  setRequirePaymentAccount: (val: boolean) => void;
  enabledPaymentMethods: string[];
  setEnabledPaymentMethods: (val: string[]) => void;
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
}: PaymentSettingsCardProps) {
  const { updateStoreProfile } = useStore();

  // Each row saves immediately on toggle rather than sitting behind an
  // edit/save mode — matches how the rest of the Payment Methods page reads
  // (a live list of switches, not a form you commit). Persisting directly
  // via updateStoreProfile (rather than the parent's handleSaveProfile)
  // avoids reading enabledPaymentMethods through a stale closure — the
  // parent's save handler only sees the new value after its own re-render.
  const toggleMethod = (id: string, checked: boolean) => {
    const next = checked
      ? [...enabledPaymentMethods, id]
      : enabledPaymentMethods.filter((m) => m !== id);
    setEnabledPaymentMethods(next);
    updateStoreProfile({ enabled_payment_methods: JSON.stringify(next) });
  };

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <div className="flex items-center gap-2">
          <CardTitle>Payment Methods</CardTitle>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Controls which payment methods appear as options on the POS checkout screen.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription>
          Toggle which payment methods your cashiers can accept at checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="divide-y rounded-lg border">
          {PAYMENT_METHODS.map((method) => (
            <div
              key={method.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <Label htmlFor={`method-${method.id}`} className="text-base font-medium cursor-pointer">
                {method.label}
              </Label>
              <Switch
                id={`method-${method.id}`}
                checked={enabledPaymentMethods.includes(method.id)}
                onCheckedChange={(checked) => toggleMethod(method.id, checked)}
              />
            </div>
          ))}
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
          <Switch
            checked={requirePaymentAccount}
            onCheckedChange={(checked) => {
              setRequirePaymentAccount(checked);
              updateStoreProfile({ require_payment_account: checked ? 1 : 0 });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

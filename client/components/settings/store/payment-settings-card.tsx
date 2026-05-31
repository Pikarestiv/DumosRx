import { Save } from "lucide-react";
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
  const toggleMethod = (id: string, checked: boolean) => {
    if (checked) {
      setEnabledPaymentMethods([...enabledPaymentMethods, id]);
    } else {
      setEnabledPaymentMethods(enabledPaymentMethods.filter((m) => m !== id));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Configuration</CardTitle>
        <CardDescription>
          Configure accepted payment methods and account rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <Label className="text-base font-semibold">Enabled Payment Methods</Label>
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
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-4 gap-4">
          <div className="space-y-0.5">
            <Label className="text-base">Require Payment Destination Account</Label>
            <p className="text-sm text-muted-foreground">
              Force cashiers to select which bank/terminal received Transfers or Card payments.
            </p>
          </div>
          <Switch
            checked={requirePaymentAccount}
            onCheckedChange={setRequirePaymentAccount}
          />
        </div>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSaveProfile} className="cursor-pointer">
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </CardFooter>
    </Card>
  );
}

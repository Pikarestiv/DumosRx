import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SubscriptionConfig } from "@/lib/types/admin";

interface PaymentGatewaySettingsProps {
  config: SubscriptionConfig;
  setConfig: (config: SubscriptionConfig) => void;
}

export function PaymentGatewaySettings({ config, setConfig }: PaymentGatewaySettingsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3 p-4 border rounded-lg bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <Label className="font-bold">Enable Paystack</Label>
            <Switch
              checked={config.enable_paystack}
              onCheckedChange={(c) =>
                setConfig({ ...config, enable_paystack: c })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            If disabled, checkout buttons will be hidden.
          </p>
        </div>
        <div className="space-y-3 p-4 border rounded-lg bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <Label className="font-bold">Enable Flutterwave</Label>
            <Switch
              checked={config.enable_flutterwave}
              onCheckedChange={(c) =>
                setConfig({ ...config, enable_flutterwave: c })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            If disabled, checkout buttons will be hidden.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mt-4">
        <h4 className="font-bold pt-2">Manual Payment Configuration</h4>
        <div className="space-y-4 p-4 border rounded-lg bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <Label className="font-bold">Enable Manual Payment</Label>
            <Switch
              checked={config.enable_manual_payment}
              onCheckedChange={(c) =>
                setConfig({ ...config, enable_manual_payment: c })
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input
                value={config.manual_payment_bank}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    manual_payment_bank: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input
                value={config.manual_payment_account_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    manual_payment_account_number: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={config.manual_payment_account_name}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    manual_payment_account_name: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

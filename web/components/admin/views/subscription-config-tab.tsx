"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSystemConfig, useUpdateSystemConfigMutation } from "@/lib/api/hooks";
import { useEffect } from "react";

export function SubscriptionConfigTab() {

  const { data: serverConfig, isLoading, isError } = useSystemConfig("subscription_plans");
  const updateMutation = useUpdateSystemConfigMutation();

  const [config, setConfig] = useState({
    trial_days: 14,
    grace_period_days: 3,
    enable_paystack: true,
    tiers: {
      local: { price_one_time: 50000, active: true },
      pro: { price_monthly: 3000, price_yearly: 30000, active: true },
      enterprise: { price_monthly: 8000, price_yearly: 80000, active: true },
    }
  });

  useEffect(() => {
    if (serverConfig) {
      setConfig({
        ...serverConfig,
        tiers: {
          local: { ...serverConfig.tiers?.local },
          pro: { ...serverConfig.tiers?.pro },
          enterprise: { ...serverConfig.tiers?.enterprise },
        }
      });
    }
  }, [serverConfig]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ key: "subscription_plans", value: config });
      toast.success("Pricing configuration saved successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to save configuration");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (isError && !serverConfig) {
    return (
      <div className="p-12 text-center text-red-500">
        Failed to load configuration from the database. Please ensure migrations are run and backend is running.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-500" />
            Pricing & Plan Configuration
          </CardTitle>
          <CardDescription>
            Adjust the pricing for each tier. These changes will reflect immediately on the user dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Dumos Local */}
            <div className="p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-base">Dumos Local</Label>
                <Switch 
                  checked={config.tiers.local.active} 
                  onCheckedChange={(c) => setConfig({ ...config, tiers: { ...config.tiers, local: { ...config.tiers.local, active: c } } })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Price (₦) - One Time</Label>
                <Input 
                  type="number" 
                  value={config.tiers.local.price_one_time} 
                  onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, local: { ...config.tiers.local, price_one_time: Number(e.target.value) } } })}
                  disabled={!config.tiers.local.active}
                />
              </div>
            </div>

            {/* Dumos Pro */}
            <div className="p-4 border rounded-xl bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/10 dark:border-indigo-900/30 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-base text-indigo-700 dark:text-indigo-400">Dumos Pro</Label>
                <Switch 
                  checked={config.tiers.pro.active} 
                  onCheckedChange={(c) => setConfig({ ...config, tiers: { ...config.tiers, pro: { ...config.tiers.pro, active: c } } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-indigo-600/70 dark:text-indigo-400/70">Price (₦) / Month</Label>
                  <Input 
                    type="number" 
                    className="border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
                    value={config.tiers.pro.price_monthly} 
                    onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, pro: { ...config.tiers.pro, price_monthly: Number(e.target.value) } } })}
                    disabled={!config.tiers.pro.active}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-indigo-600/70 dark:text-indigo-400/70">Price (₦) / Year</Label>
                  <Input 
                    type="number" 
                    className="border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
                    value={config.tiers.pro.price_yearly} 
                    onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, pro: { ...config.tiers.pro, price_yearly: Number(e.target.value) } } })}
                    disabled={!config.tiers.pro.active}
                  />
                </div>
              </div>
            </div>

            {/* Enterprise */}
            <div className="p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-base">Enterprise</Label>
                <Switch 
                  checked={config.tiers.enterprise.active} 
                  onCheckedChange={(c) => setConfig({ ...config, tiers: { ...config.tiers, enterprise: { ...config.tiers.enterprise, active: c } } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Price (₦) / Month</Label>
                  <Input 
                    type="number" 
                    value={config.tiers.enterprise.price_monthly} 
                    onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, enterprise: { ...config.tiers.enterprise, price_monthly: Number(e.target.value) } } })}
                    disabled={!config.tiers.enterprise.active}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Price (₦) / Year</Label>
                  <Input 
                    type="number" 
                    value={config.tiers.enterprise.price_yearly} 
                    onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, enterprise: { ...config.tiers.enterprise, price_yearly: Number(e.target.value) } } })}
                    disabled={!config.tiers.enterprise.active}
                  />
                </div>
              </div>
            </div>

          </div>

          <div className="border-t pt-6 mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Free Trial Duration (Days)</Label>
              <Input 
                type="number" 
                value={config.trial_days} 
                onChange={(e) => setConfig({ ...config, trial_days: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">Default trial period for new registrations.</p>
            </div>
            
            <div className="space-y-3 p-4 border rounded-lg bg-card">
               <div className="flex items-center justify-between">
                 <Label className="font-bold">Enable Paystack Gateway</Label>
                 <Switch 
                   checked={config.enable_paystack} 
                   onCheckedChange={(c) => setConfig({ ...config, enable_paystack: c })}
                 />
               </div>
               <p className="text-xs text-muted-foreground">If disabled, the user dashboard will hide the checkout buttons.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/30 p-4 border-t flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {updateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

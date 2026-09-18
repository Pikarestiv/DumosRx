"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, CreditCard, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useSystemConfig,
  useUpdateSystemConfigMutation,
} from "@/lib/api/hooks";
import { PlanTierCard } from "./plan-tier-card";
import { SocialLinksConfigCard } from "./social-links-config-card";
import {
  DEFAULT_SUBSCRIPTION_CONFIG,
  DEFAULT_SOCIAL_LINKS,
  mergeSubscriptionConfig,
  mergeSocialLinks,
} from "@/lib/constants/subscription-config-defaults";
import type { SubscriptionConfig, SocialLinksConfig } from "@/lib/types/admin";

export function SubscriptionConfigTab() {
  const {
    data: serverConfigData,
    isLoading,
    isError,
  } = useSystemConfig("subscription_plans");
  const serverConfig = serverConfigData as
    | Partial<SubscriptionConfig>
    | undefined;
  const { data: socialConfigData, isLoading: isSocialLoading } =
    useSystemConfig("social_links");
  const socialConfig = socialConfigData as
    | Partial<SocialLinksConfig>
    | undefined;
  const updateMutation = useUpdateSystemConfigMutation();

  const [config, setConfig] = useState<SubscriptionConfig>(
    DEFAULT_SUBSCRIPTION_CONFIG,
  );
  const [socialLinks, setSocialLinks] = useState<SocialLinksConfig>(
    DEFAULT_SOCIAL_LINKS,
  );

  useEffect(() => {
    if (serverConfig) setConfig(mergeSubscriptionConfig(serverConfig));
  }, [serverConfig]);

  useEffect(() => {
    if (socialConfig) setSocialLinks(mergeSocialLinks(socialConfig));
  }, [socialConfig]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        key: "subscription_plans",
        value: config,
      });
      toast.success("Pricing configuration saved successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save configuration",
      );
    }
  };

  const handleSaveSocial = async () => {
    try {
      await updateMutation.mutateAsync({
        key: "social_links",
        value: socialLinks,
      });
      toast.success("Social links saved successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save social links",
      );
    }
  };

  if (isLoading || isSocialLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (isError && !serverConfig) {
    return (
      <div className="p-12 text-center text-red-500">
        Failed to load configuration from the database. Please ensure migrations
        are run and backend is running.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-500" />
            Pricing & Plan Configuration
          </CardTitle>
          <CardDescription>
            Adjust the pricing for each tier. These changes will reflect
            immediately on the user dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <PlanTierCard
              tierKey="free"
              title="Free Plan"
              config={config}
              setConfig={setConfig}
            />

            <PlanTierCard
              tierKey="starter"
              title="Starter Plan"
              config={config}
              setConfig={setConfig}
            />

            <PlanTierCard
              tierKey="pro"
              title="Dumos Pro"
              config={config}
              setConfig={setConfig}
              isFeatured={true}
            />

            <PlanTierCard
              tierKey="enterprise"
              title="Enterprise"
              config={config}
              setConfig={setConfig}
            />
          </div>

          <div className="border-t pt-6 mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Free Trial Duration (Days)</Label>
                <Input
                  type="number"
                  value={config.trial_days}
                  onChange={(e) =>
                    setConfig({ ...config, trial_days: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Length of trial.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Free Trial Plan</Label>
                <Select
                  value={config.trial_plan}
                  onValueChange={(value) =>
                    setConfig({ ...config, trial_plan: value })
                  }
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-900">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter Plan</SelectItem>
                    <SelectItem value="pro">Dumos Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Tier to trial.</p>
              </div>
            </div>

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
          </div>
        </CardContent>
        <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>

      <SocialLinksConfigCard
        socialLinks={socialLinks}
        setSocialLinks={setSocialLinks}
        onSave={handleSaveSocial}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
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
import { ConfigLoadError } from "./config-load-error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
    error: configError,
    refetch,
  } = useSystemConfig("subscription_plans");
  const serverConfig = serverConfigData as
    | Partial<SubscriptionConfig>
    | undefined;
  const {
    data: socialConfigData,
    isLoading: isSocialLoading,
    isError: isSocialError,
    error: socialError,
    refetch: refetchSocial,
  } = useSystemConfig("social_links");
  const socialConfig = socialConfigData as
    | Partial<SocialLinksConfig>
    | undefined;
  const updateMutation = useUpdateSystemConfigMutation();

  const { data: storefrontFeeData } = useSystemConfig(
    "storefront_platform_fee_percentage",
  );
  const [localStorefrontFee, setLocalStorefrontFee] = useState(
    typeof storefrontFeeData === "number" ? storefrontFeeData : 2,
  );
  const [prevStorefrontFeeData, setPrevStorefrontFeeData] = useState(
    storefrontFeeData,
  );
  const updateStorefrontFeeMutation = useUpdateSystemConfigMutation();

  // storefrontFeeData arrives asynchronously (undefined at mount), so the
  // useState above only captures the fallback default; sync local state once
  // the real server value lands, same as the social_links config below.
  if (storefrontFeeData !== prevStorefrontFeeData) {
    setPrevStorefrontFeeData(storefrontFeeData);
    if (typeof storefrontFeeData === "number") {
      setLocalStorefrontFee(storefrontFeeData);
    }
  }

  const [config, setConfig] = useState<SubscriptionConfig>(
    DEFAULT_SUBSCRIPTION_CONFIG,
  );
  const [socialLinks, setSocialLinks] = useState<SocialLinksConfig>(
    DEFAULT_SOCIAL_LINKS,
  );
  const [prevServerConfig, setPrevServerConfig] = useState(serverConfig);
  const [prevSocialConfig, setPrevSocialConfig] = useState(socialConfig);

  // The last configuration known to be stored server-side. Used to work out
  // which plan prices this edit would actually change, so the confirmation
  // step can name them.
  const [savedConfig, setSavedConfig] = useState<SubscriptionConfig>(
    DEFAULT_SUBSCRIPTION_CONFIG,
  );
  const [pendingPriceConfirm, setPendingPriceConfirm] = useState(false);

  if (serverConfig !== prevServerConfig) {
    setPrevServerConfig(serverConfig);
    if (serverConfig) {
      const merged = mergeSubscriptionConfig(serverConfig);
      setConfig(merged);
      setSavedConfig(merged);
    }
  }

  const TIER_LABELS: Record<keyof SubscriptionConfig["tiers"], string> = {
    free: "Free Plan",
    starter: "Starter Plan",
    pro: "Dumos Pro",
    enterprise: "Enterprise",
  };

  const naira = (amount: number) => `₦${amount.toLocaleString()}`;

  // Price edits are the one change on this tab that takes money-visible
  // effect the moment it saves ("reflect immediately on the user dashboard"),
  // so they get an explicit are-you-sure naming every before/after value.
  const priceChanges = (
    Object.keys(TIER_LABELS) as (keyof SubscriptionConfig["tiers"])[]
  ).flatMap((tierKey) => {
    const next = config.tiers[tierKey];
    const prev = savedConfig.tiers[tierKey];
    const changes: string[] = [];
    if (next.price_monthly !== prev.price_monthly) {
      changes.push(
        `${TIER_LABELS[tierKey]} monthly ${naira(prev.price_monthly)} → ${naira(next.price_monthly)}`,
      );
    }
    if (next.price_yearly !== prev.price_yearly) {
      changes.push(
        `${TIER_LABELS[tierKey]} yearly ${naira(prev.price_yearly)} → ${naira(next.price_yearly)}`,
      );
    }
    return changes;
  });

  if (socialConfig !== prevSocialConfig) {
    setPrevSocialConfig(socialConfig);
    if (socialConfig) setSocialLinks(mergeSocialLinks(socialConfig));
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        key: "subscription_plans",
        value: config,
      });
      setSavedConfig(config);
      toast.success("Pricing configuration saved successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save configuration",
      );
    }
  };

  const handleSaveClick = () => {
    if (priceChanges.length > 0) {
      setPendingPriceConfirm(true);
      return;
    }
    void handleSave();
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

  // Both queries gate the whole tab: the Save buttons submit this form's
  // state, so rendering the editor off bundled defaults after a failed fetch
  // is exactly what let one click reset live plan pricing.
  if (isError || isSocialError) {
    return (
      <ConfigLoadError
        label="pricing configuration"
        error={isError ? configError : socialError}
        onRetry={() => {
          void refetch();
          void refetchSocial();
        }}
      />
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
            onClick={handleSaveClick}
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

      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <CardTitle>Storefront Commission</CardTitle>
          <CardDescription>
            The percentage DumosRx keeps from every online storefront sale.
            Changing this updates every store that already has a connected
            payment account, not just new ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="storefront-commission">
              Storefront Commission (%)
            </Label>
            <Input
              id="storefront-commission"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={localStorefrontFee}
              onChange={(e) => setLocalStorefrontFee(Number(e.target.value))}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={async () => {
              await updateStorefrontFeeMutation.mutateAsync({
                key: "storefront_platform_fee_percentage",
                value: localStorefrontFee,
              });
              toast.success("Storefront commission updated.");
            }}
            disabled={updateStorefrontFeeMutation.isPending}
          >
            Save Storefront Commission
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={pendingPriceConfirm}
        onOpenChange={setPendingPriceConfirm}
        title="Publish new plan pricing?"
        description={`These prices go live on the user dashboard and the public pricing page as soon as you confirm: ${priceChanges.join("; ")}.`}
        confirmLabel="Publish pricing"
        variant="destructive"
        onConfirm={() => void handleSave()}
      />

      <SocialLinksConfigCard
        socialLinks={socialLinks}
        setSocialLinks={setSocialLinks}
        onSave={() => void handleSaveSocial()}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}

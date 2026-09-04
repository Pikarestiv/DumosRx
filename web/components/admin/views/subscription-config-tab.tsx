"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, CreditCard, Loader2, Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSystemConfig, useUpdateSystemConfigMutation } from "@/lib/api/hooks";
import { useEffect } from "react";
import { PlanTierCard } from "./plan-tier-card";
import type { SubscriptionConfig, SocialLinksConfig } from "@/lib/types/admin";

export function SubscriptionConfigTab() {

  const { data: serverConfigData, isLoading, isError } = useSystemConfig("subscription_plans");
  const serverConfig = serverConfigData as Partial<SubscriptionConfig> | undefined;
  const { data: socialConfigData, isLoading: isSocialLoading } = useSystemConfig("social_links");
  const socialConfig = socialConfigData as Partial<SocialLinksConfig> | undefined;
  const updateMutation = useUpdateSystemConfigMutation();

  const [config, setConfig] = useState<SubscriptionConfig>({
    trial_days: 14,
    trial_plan: "pro",
    grace_period_days: 3,
    enable_paystack: true,
    enable_flutterwave: true,
    enable_manual_payment: true,
    manual_payment_bank: "Moniepoint",
    manual_payment_account_number: "6656081317",
    manual_payment_account_name: "Dumos Technologies",
    tiers: {
      free: { price_monthly: 0, price_yearly: 0, active: true, limits: { staff: 1, stores: 1, sync_interval: 360 }, features: { cloud_sync: false, web_dashboard: false, mobile_app: false, ecommerce: false, smart_pos: true, custom_branding: false, remove_branding: false, broadcast_create: false, auto_backup: false, multi_store: false, procurement: false, prescriptions: false, expenses: false, audit_mode: false, dark_mode: true, smart_suggestions: false, auto_lock: true, barcode_generation: false, loyalty_program: false } },
      starter: { price_monthly: 3000, price_yearly: 30000, active: true, limits: { staff: 3, stores: 1, sync_interval: 180 }, features: { cloud_sync: true, web_dashboard: true, mobile_app: false, ecommerce: false, smart_pos: true, custom_branding: false, remove_branding: false, broadcast_create: false, auto_backup: false, multi_store: false, procurement: true, prescriptions: true, expenses: true, audit_mode: false, dark_mode: true, smart_suggestions: false, auto_lock: true, barcode_generation: true, loyalty_program: false } },
      pro: { price_monthly: 8000, price_yearly: 80000, active: true, limits: { staff: 10, stores: 3, sync_interval: 30 }, features: { cloud_sync: true, web_dashboard: true, mobile_app: true, ecommerce: true, smart_pos: true, custom_branding: true, remove_branding: true, broadcast_create: true, auto_backup: true, multi_store: false, procurement: true, prescriptions: true, expenses: true, audit_mode: true, dark_mode: true, smart_suggestions: true, auto_lock: true, barcode_generation: true, loyalty_program: true } },
      enterprise: { price_monthly: 15000, price_yearly: 150000, active: true, limits: { staff: -1, stores: -1, sync_interval: 15 }, features: { cloud_sync: true, web_dashboard: true, mobile_app: true, ecommerce: true, smart_pos: true, custom_branding: true, remove_branding: true, broadcast_create: true, auto_backup: true, multi_store: true, procurement: true, prescriptions: true, expenses: true, audit_mode: true, dark_mode: true, smart_suggestions: true, auto_lock: true, barcode_generation: true, loyalty_program: true } },
    }
  });

  const [socialLinks, setSocialLinks] = useState<SocialLinksConfig>({
    twitter: "",
    facebook: "",
    linkedin: "",
    github: "",
    instagram: "",
    active_links: {
      twitter: true,
      facebook: true,
      linkedin: true,
      github: true,
      instagram: true,
    }
  });

  useEffect(() => {
    if (serverConfig) {
      setConfig({
        ...serverConfig,
        trial_days: serverConfig.trial_days ?? 14,
        grace_period_days: serverConfig.grace_period_days ?? 3,
        enable_paystack: serverConfig.enable_paystack ?? true,
        enable_flutterwave: serverConfig.enable_flutterwave ?? true,
        enable_manual_payment: serverConfig.enable_manual_payment ?? true,
        manual_payment_bank: serverConfig.manual_payment_bank ?? "Moniepoint",
        manual_payment_account_number: serverConfig.manual_payment_account_number ?? "6656081317",
        manual_payment_account_name: serverConfig.manual_payment_account_name ?? "Dumos Technologies",
        trial_plan: serverConfig.trial_plan ?? "pro",
        tiers: {
          free: {
            price_monthly: serverConfig.tiers?.free?.price_monthly ?? 0,
            price_yearly: serverConfig.tiers?.free?.price_yearly ?? 0,
            active: serverConfig.tiers?.free?.active ?? true,
            limits: serverConfig.tiers?.free?.limits ?? { staff: 1, stores: 1, sync_interval: 360 },
            features: serverConfig.tiers?.free?.features ?? { cloud_sync: false, web_dashboard: false, mobile_app: false, ecommerce: false, smart_pos: true, custom_branding: false, remove_branding: false, broadcast_create: false, auto_backup: false, multi_store: false, procurement: false, prescriptions: false, expenses: false, audit_mode: false, dark_mode: true, smart_suggestions: false, auto_lock: true, barcode_generation: false, loyalty_program: false },
          },
          starter: {
            price_monthly: serverConfig.tiers?.starter?.price_monthly ?? 3000,
            price_yearly: serverConfig.tiers?.starter?.price_yearly ?? 30000,
            active: serverConfig.tiers?.starter?.active ?? true,
            limits: serverConfig.tiers?.starter?.limits ?? { staff: 3, stores: 1, sync_interval: 180 },
            features: serverConfig.tiers?.starter?.features ?? { cloud_sync: true, web_dashboard: true, mobile_app: false, ecommerce: false, smart_pos: true, custom_branding: false, remove_branding: false, broadcast_create: false, auto_backup: false, multi_store: false, procurement: true, prescriptions: true, expenses: true, audit_mode: false, dark_mode: true, smart_suggestions: false, auto_lock: true, barcode_generation: true, loyalty_program: false },
          },
          pro: {
            price_monthly: serverConfig.tiers?.pro?.price_monthly ?? 8000,
            price_yearly: serverConfig.tiers?.pro?.price_yearly ?? 80000,
            active: serverConfig.tiers?.pro?.active ?? true,
            limits: serverConfig.tiers?.pro?.limits ?? { staff: 10, stores: 3, sync_interval: 30 },
            features: serverConfig.tiers?.pro?.features ?? { cloud_sync: true, web_dashboard: true, mobile_app: true, ecommerce: true, smart_pos: true, custom_branding: true, remove_branding: true, broadcast_create: true, auto_backup: true, multi_store: false, procurement: true, prescriptions: true, expenses: true, audit_mode: true, dark_mode: true, smart_suggestions: true, auto_lock: true, barcode_generation: true, loyalty_program: true },
          },
          enterprise: {
            price_monthly: serverConfig.tiers?.enterprise?.price_monthly ?? 15000,
            price_yearly: serverConfig.tiers?.enterprise?.price_yearly ?? 150000,
            active: serverConfig.tiers?.enterprise?.active ?? true,
            limits: serverConfig.tiers?.enterprise?.limits ?? { staff: -1, stores: -1, sync_interval: 15 },
            features: serverConfig.tiers?.enterprise?.features ?? { cloud_sync: true, web_dashboard: true, mobile_app: true, ecommerce: true, smart_pos: true, custom_branding: true, remove_branding: true, broadcast_create: true, auto_backup: true, multi_store: true, procurement: true, prescriptions: true, expenses: true, audit_mode: true, dark_mode: true, smart_suggestions: true, auto_lock: true, barcode_generation: true, loyalty_program: true },
          },
        }
      });
    }
  }, [serverConfig]);

  useEffect(() => {
    if (socialConfig) {
      setSocialLinks({
        twitter: socialConfig.twitter || "",
        facebook: socialConfig.facebook || "",
        linkedin: socialConfig.linkedin || "",
        github: socialConfig.github || "",
        instagram: socialConfig.instagram || "",
        active_links: {
          twitter: socialConfig.active_links?.twitter ?? true,
          facebook: socialConfig.active_links?.facebook ?? true,
          linkedin: socialConfig.active_links?.linkedin ?? true,
          github: socialConfig.active_links?.github ?? true,
          instagram: socialConfig.active_links?.instagram ?? true,
        }
      });
    }
  }, [socialConfig]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ key: "subscription_plans", value: config });
      toast.success("Pricing configuration saved successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save configuration");
    }
  };

  const handleSaveSocial = async () => {
    try {
      await updateMutation.mutateAsync({ key: "social_links", value: socialLinks });
      toast.success("Social links saved successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save social links");
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
        Failed to load configuration from the database. Please ensure migrations are run and backend is running.
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
            Adjust the pricing for each tier. These changes will reflect immediately on the user dashboard.
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
                  onChange={(e) => setConfig({ ...config, trial_days: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">Length of trial.</p>
              </div>
              <div className="space-y-2">
                <Label>Free Trial Plan</Label>
                <Select
                  value={config.trial_plan}
                  onValueChange={(value) => setConfig({ ...config, trial_plan: value })}
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
                     onCheckedChange={(c) => setConfig({ ...config, enable_paystack: c })}
                   />
                 </div>
                 <p className="text-xs text-muted-foreground">If disabled, checkout buttons will be hidden.</p>
              </div>
              <div className="space-y-3 p-4 border rounded-lg bg-white dark:bg-slate-900">
                 <div className="flex items-center justify-between">
                   <Label className="font-bold">Enable Flutterwave</Label>
                   <Switch 
                     checked={config.enable_flutterwave} 
                     onCheckedChange={(c) => setConfig({ ...config, enable_flutterwave: c })}
                   />
                 </div>
                 <p className="text-xs text-muted-foreground">If disabled, checkout buttons will be hidden.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 mt-4">
              <h4 className="font-bold pt-2">Manual Payment Configuration</h4>
              <div className="space-y-4 p-4 border rounded-lg bg-white dark:bg-slate-900">
                 <div className="flex items-center justify-between">
                   <Label className="font-bold">Enable Manual Payment</Label>
                   <Switch 
                     checked={config.enable_manual_payment} 
                     onCheckedChange={(c) => setConfig({ ...config, enable_manual_payment: c })}
                   />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                   <div className="space-y-2">
                     <Label>Bank Name</Label>
                     <Input 
                       value={config.manual_payment_bank} 
                       onChange={(e) => setConfig({ ...config, manual_payment_bank: e.target.value })}
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>Account Number</Label>
                     <Input 
                       value={config.manual_payment_account_number} 
                       onChange={(e) => setConfig({ ...config, manual_payment_account_number: e.target.value })}
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>Account Name</Label>
                     <Input 
                       value={config.manual_payment_account_name} 
                       onChange={(e) => setConfig({ ...config, manual_payment_account_name: e.target.value })}
                     />
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {updateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-500" />
            Social Media Configurations
          </CardTitle>
          <CardDescription>
            Update URLs and toggle visibility of social media accounts shown in the website footer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["twitter", "facebook", "linkedin", "github", "instagram"] as const).map((platform) => (
            <div key={platform} className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50">
              <div className="flex-1 space-y-1">
                <Label className="capitalize font-bold text-sm">{platform} URL</Label>
                <Input
                  type="text"
                  placeholder={`e.g. https://${platform}.com/dumosrx`}
                  value={socialLinks[platform]}
                  onChange={(e) => setSocialLinks({ ...socialLinks, [platform]: e.target.value })}
                  disabled={!socialLinks.active_links[platform]}
                  className="bg-white dark:bg-slate-900 border-accent/20"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0 md:pt-6">
                <Label htmlFor={`toggle-${platform}`} className="text-xs text-muted-foreground">Active</Label>
                <Switch
                  id={`toggle-${platform}`}
                  checked={socialLinks.active_links[platform]}
                  onCheckedChange={(c) => setSocialLinks({
                    ...socialLinks,
                    active_links: {
                      ...socialLinks.active_links,
                      [platform]: c
                    }
                  })}
                />
              </div>
            </div>
          ))}
        </CardContent>
        <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex justify-end">
          <Button onClick={handleSaveSocial} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {updateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Social Links
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

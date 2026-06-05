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

export function SubscriptionConfigTab() {

  const { data: serverConfig, isLoading, isError } = useSystemConfig("subscription_plans");
  const { data: socialConfig, isLoading: isSocialLoading } = useSystemConfig("social_links");
  const updateMutation = useUpdateSystemConfigMutation();

  const [config, setConfig] = useState({
    trial_days: 14,
    trial_plan: "pro",
    grace_period_days: 3,
    enable_paystack: true,
    tiers: {
      free: { price_monthly: 0, price_yearly: 0, active: true },
      starter: { price_monthly: 3000, price_yearly: 30000, active: true },
      pro: { price_monthly: 8000, price_yearly: 80000, active: true },
      enterprise: { price_monthly: 15000, price_yearly: 150000, active: true },
    }
  });

  const [socialLinks, setSocialLinks] = useState({
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
        trial_plan: serverConfig.trial_plan ?? "pro",
        tiers: {
          free: {
            price_monthly: serverConfig.tiers?.free?.price_monthly ?? 0,
            price_yearly: serverConfig.tiers?.free?.price_yearly ?? 0,
            active: serverConfig.tiers?.free?.active ?? true,
          },
          starter: {
            price_monthly: serverConfig.tiers?.starter?.price_monthly ?? 3000,
            price_yearly: serverConfig.tiers?.starter?.price_yearly ?? 30000,
            active: serverConfig.tiers?.starter?.active ?? true,
          },
          pro: {
            price_monthly: serverConfig.tiers?.pro?.price_monthly ?? 8000,
            price_yearly: serverConfig.tiers?.pro?.price_yearly ?? 80000,
            active: serverConfig.tiers?.pro?.active ?? true,
          },
          enterprise: {
            price_monthly: serverConfig.tiers?.enterprise?.price_monthly ?? 15000,
            price_yearly: serverConfig.tiers?.enterprise?.price_yearly ?? 150000,
            active: serverConfig.tiers?.enterprise?.active ?? true,
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
    } catch (error: any) {
      toast.error(error.message || "Failed to save configuration");
    }
  };

  const handleSaveSocial = async () => {
    try {
      await updateMutation.mutateAsync({ key: "social_links", value: socialLinks });
      toast.success("Social links saved successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to save social links");
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Starter */}
            <div className="p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-base">Starter Plan</Label>
                <Switch 
                  checked={config.tiers.starter.active} 
                  onCheckedChange={(c) => setConfig({ ...config, tiers: { ...config.tiers, starter: { ...config.tiers.starter, active: c } } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Price (₦) / Month</Label>
                  <Input 
                    type="number" 
                    value={config.tiers.starter.price_monthly} 
                    onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, starter: { ...config.tiers.starter, price_monthly: Number(e.target.value) } } })}
                    disabled={!config.tiers.starter.active}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Price (₦) / Year</Label>
                  <Input 
                    type="number" 
                    value={config.tiers.starter.price_yearly} 
                    onChange={(e) => setConfig({ ...config, tiers: { ...config.tiers, starter: { ...config.tiers.starter, price_yearly: Number(e.target.value) } } })}
                    disabled={!config.tiers.starter.active}
                  />
                </div>
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
            
            <div className="space-y-3 p-4 border rounded-lg bg-white dark:bg-slate-900">
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
          {["twitter", "facebook", "linkedin", "github", "instagram"].map((platform) => (
            <div key={platform} className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50">
              <div className="flex-1 space-y-1">
                <Label className="capitalize font-bold text-sm">{platform} URL</Label>
                <Input
                  type="text"
                  placeholder={`e.g. https://${platform}.com/dumosrx`}
                  value={(socialLinks as any)[platform]}
                  onChange={(e) => setSocialLinks({ ...socialLinks, [platform]: e.target.value })}
                  disabled={!(socialLinks.active_links as any)[platform]}
                  className="bg-white dark:bg-slate-900 border-accent/20"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0 md:pt-6">
                <Label htmlFor={`toggle-${platform}`} className="text-xs text-muted-foreground">Active</Label>
                <Switch
                  id={`toggle-${platform}`}
                  checked={(socialLinks.active_links as any)[platform]}
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

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemHealthTab } from "@/components/admin/views/system-health-tab";
import { EmailTemplatesTab } from "@/components/admin/views/email-templates-tab";
import { SubscriptionConfigTab } from "@/components/admin/views/subscription-config-tab";
import { SuggestionsConfigTab } from "@/components/admin/views/suggestions-config-tab";
import { IntegrationsTab } from "@/components/admin/views/integrations-tab";
import { Settings, Activity, Mail, CreditCard, Sparkles, Plug } from "lucide-react";

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8 text-indigo-500" />
            Platform Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage system configurations, infrastructure health, and platform-wide templates.
          </p>
        </div>
      </div>

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="mb-4 bg-slate-100 dark:bg-slate-900">
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing & Plans
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Dynamic Suggestions
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Templates
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="focus-visible:outline-none focus-visible:ring-0">
          <SystemHealthTab />
        </TabsContent>

        <TabsContent value="billing" className="focus-visible:outline-none focus-visible:ring-0">
          <SubscriptionConfigTab />
        </TabsContent>

        <TabsContent value="suggestions" className="focus-visible:outline-none focus-visible:ring-0">
          <SuggestionsConfigTab />
        </TabsContent>

        <TabsContent value="templates" className="focus-visible:outline-none focus-visible:ring-0">
          <EmailTemplatesTab />
        </TabsContent>

        <TabsContent value="integrations" className="focus-visible:outline-none focus-visible:ring-0">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

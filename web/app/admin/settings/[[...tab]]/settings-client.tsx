"use client";

import { useParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubscriptionConfigTab } from "@/components/admin/views/subscription-config-tab";
import { SuggestionsConfigTab } from "@/components/admin/views/suggestions-config-tab";
import { IntegrationsTab } from "@/components/admin/views/integrations-tab";
import { SecurityConfigTab } from "@/components/admin/views/security-config-tab";
import { AdminPermissionsCard } from "@/components/admin/views/admin-permissions-card";
import { DefaultAccountManagerCard } from "@/components/admin/views/default-account-manager-card";
import { Settings, CreditCard, Sparkles, Plug, ShieldCheck, Users, UserCog } from "lucide-react";

const DEFAULT_TAB = "billing";

export default function PlatformSettingsPage() {
  const params = useParams();
  const router = useRouter();

  const activeTab = (params.tab as string[])?.[0] || DEFAULT_TAB;

  const handleTabChange = (value: string) => {
    if (value === DEFAULT_TAB) {
      router.push("/admin/settings");
    } else {
      router.push(`/admin/settings/${value}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8 text-indigo-500" />
            Platform Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage platform-wide configuration. Infrastructure health lives under Operations.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4 bg-muted w-full flex overflow-x-auto whitespace-nowrap no-scrollbar justify-start p-1 h-12 gap-1">
          <TabsTrigger value="billing" className="flex items-center gap-2 px-4 shrink-0">
            <CreditCard className="h-4 w-4" />
            Billing &amp; Plans
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="flex items-center gap-2 px-4 shrink-0">
            <Sparkles className="h-4 w-4" />
            Dynamic Suggestions
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2 px-4 shrink-0">
            <Plug className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2 px-4 shrink-0">
            <ShieldCheck className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="account-manager" className="flex items-center gap-2 px-4 shrink-0">
            <UserCog className="h-4 w-4" />
            Account Manager
          </TabsTrigger>
          <TabsTrigger value="admin-permissions" className="flex items-center gap-2 px-4 shrink-0">
            <Users className="h-4 w-4" />
            Admin Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="focus-visible:outline-none focus-visible:ring-0">
          <SubscriptionConfigTab />
        </TabsContent>

        <TabsContent value="suggestions" className="focus-visible:outline-none focus-visible:ring-0">
          <SuggestionsConfigTab />
        </TabsContent>

        <TabsContent value="integrations" className="focus-visible:outline-none focus-visible:ring-0">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="security" className="focus-visible:outline-none focus-visible:ring-0">
          <SecurityConfigTab />
        </TabsContent>

        <TabsContent value="account-manager" className="focus-visible:outline-none focus-visible:ring-0">
          <DefaultAccountManagerCard />
        </TabsContent>

        <TabsContent value="admin-permissions" className="focus-visible:outline-none focus-visible:ring-0">
          <AdminPermissionsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

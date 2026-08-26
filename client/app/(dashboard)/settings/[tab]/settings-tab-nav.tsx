import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Bell, Shield, Database, Palette, Globe, Users, CreditCard, UserCircle } from "lucide-react";

interface SettingsTabNavProps {
  isAdmin: boolean;
  isDesktop: boolean;
}

/** Tab nav only. Pairs with sibling <TabsContent> panels owned by the parent, which switches page content on selection. */
export function SettingsTabNav({ isAdmin, isDesktop }: SettingsTabNavProps) {
  return (
    <TabsList
      className="hidden md:flex flex-col h-auto overflow-x-auto scrollbar-none md:overflow-visible bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b md:border-none p-2 md:p-0 gap-1 justify-start md:w-full sticky md:relative z-30"
      style={{ top: !isDesktop ? "0px" : undefined }}
    >
      <TabsTrigger
        value="appearance"
        className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
      >
        <Palette className="w-4 h-4 mr-2 md:mr-3" />
        <span className="text-sm">General</span>
      </TabsTrigger>
      {isAdmin && (
        <TabsTrigger
          value="account"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <UserCircle className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Account</span>
        </TabsTrigger>
      )}
      {isAdmin && (
        <TabsTrigger
          value="store"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <Store className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Store Profile</span>
        </TabsTrigger>
      )}
      <TabsTrigger
        value="notifications"
        className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
      >
        <Bell className="w-4 h-4 mr-2 md:mr-3" />
        <span className="text-sm">Alerts</span>
      </TabsTrigger>
      {isAdmin && (
        <TabsTrigger
          value="data"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <Database className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Data & Sync</span>
        </TabsTrigger>
      )}
      <TabsTrigger
        value="security"
        className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
      >
        <Shield className="w-4 h-4 mr-2 md:mr-3" />
        <span className="text-sm">Security</span>
      </TabsTrigger>
      {isAdmin && (
        <TabsTrigger
          value="staff"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <Users className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Staff</span>
        </TabsTrigger>
      )}
      {isAdmin && (
        <TabsTrigger
          value="system"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <Globe className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">System</span>
        </TabsTrigger>
      )}
      {isAdmin && (
        <TabsTrigger
          value="billing"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <CreditCard className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Billing</span>
        </TabsTrigger>
      )}
    </TabsList>
  );
}

"use client";

import { StaffView } from "./staff-view";
import { ActivitiesView } from "./activities-view";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { Users, Activity } from "lucide-react";

export function StaffWrapperView({
  staff,
  stores,
  subView,
}: {
  staff?: any[];
  stores?: any[];
  subView?: string;
}) {
  const router = useRouter();

  // Default to "management" if subView is missing or unrecognized
  const currentTab = subView === "activities" ? "activities" : "management";

  const handleTabChange = (value: string) => {
    router.push(`/dashboard/staff/${value}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Staff</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team and track their activities across all stores.
          </p>
        </div>
      </div>

      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Management</span>
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Activities</span>
          </TabsTrigger>
        </TabsList>

        {/* We don't use TabsContent because the actual rendering is dependent on the URL parameter */}
        <div className="mt-6">
          {currentTab === "management" && (
            <StaffView
              staff={staff || []}
              stores={stores || []}
              hideHeader={true}
            />
          )}
          {currentTab === "activities" && (
            <ActivitiesView stores={stores || []} hideHeader={true} />
          )}
        </div>
      </Tabs>
    </div>
  );
}
